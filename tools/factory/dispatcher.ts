/**
 * Dispatcher of the software factory.
 *
 * Each run (once, or every --interval seconds):
 * 1. Pull requests of agent tasks in `in-review` (with `agent-task`):
 *    - merged by hand: the task moves to `done`;
 *    - Crysk loop closed with no blocking finding: squash-merge, task to `done`;
 *    - findings to fix: the agent runs its review loop on it (step 2).
 * 2. One agent at a time (`claude -p`, prompt in agent-prompt.md). Open PRs with findings come
 *    first; otherwise the next `to-do` task with `agent-task` not blocked by an unfinished task.
 *    The agent implements the task, opens the PR and answers Crysk's review until it closes.
 * 3. After the agent, deterministic code decides: merge, or escalate to a human (Kaneo comment,
 *    desktop notification and a GitHub mention) when blocking findings remain.
 *
 * Usage:
 *   npx tsx tools/factory/dispatcher.ts                 # run once and exit
 *   npx tsx tools/factory/dispatcher.ts --interval 90   # run every 90 seconds
 *   npx tsx tools/factory/dispatcher.ts --dry-run       # print only, change nothing
 */
import { execFile, execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { parseArgs } from "node:util";
import { decideReview, parseCryskStatus, prNumberFromUrl, type ReviewAction } from "./lib/review.ts";
import {
  AGENT_LABEL,
  DONE_STATUS,
  IN_REVIEW_STATUS,
  PRIORITY_ORDER,
  READY_STATUS,
  decide,
  isAgentTask,
  type Block,
  type Priority,
  type Task,
} from "./lib/select.ts";
// Shared with the factory UI, which reads these files (tools/factory/ui).
import type { RunningAgent } from "./ui/src/lib/runningAgent.ts";

const KANEO_URL = process.env.KANEO_URL ?? "http://localhost:5173";
const PROJECT_ID = process.env.KANEO_PROJECT_ID ?? "zqkq7jtldcvxardzfsdyka33";
const ENV_FILE = join(homedir(), ".config", "factory", "kaneo.env");

const AREA_LABELS = ["backend", "frontend", "scrapling"] as const;
type Area = (typeof AREA_LABELS)[number];

/** Folders an agent may modify for each area label. A task without area labels may touch the whole repo. */
const AREA_DIRS: Record<Area, string[]> = {
  backend: ["apps/backend", "apps/shared"],
  frontend: ["apps/frontend", "apps/shared"],
  scrapling: ["tools/scrapling", "apps/shared"],
};

// The agent may wait for Crysk reviews (up to 75 min each) inside its loop.
const AGENT_TIMEOUT_MS = 180 * 60 * 1000;

const ALLOWED_TOOLS = [
  "Read",
  "Edit",
  "Write",
  "Glob",
  "Grep",
  "Bash(git *)",
  "Bash(gh pr create *)",
  "Bash(gh pr view *)",
  // Crysk review loop: read the diff and review threads, post /crysk commands.
  "Bash(gh pr diff *)",
  "Bash(gh pr comment *)",
  "Bash(gh api *)",
  "Bash(npm *)",
  "Bash(npx *)",
  "Bash(uv *)",
  "Bash(cd *)",
  "Bash(ls *)",
  // Network access, needed to explore the sites an adapter scrapes (GraphQL needs curl for POST).
  "WebFetch",
  "Bash(curl *)",
  "mcp__playwright",
  "mcp__kaneo",
];

// Prefix-based deny rules are a seatbelt, not a guarantee: the real protection for main
// is GitHub branch protection (step 7). Merging is the dispatcher's job, never the agent's.
const DISALLOWED_TOOLS = [
  "Bash(git push --force *)",
  "Bash(git push -f *)",
  "Bash(git push origin main *)",
  "Bash(git reset --hard *)",
  "Bash(gh pr merge *)",
  "Bash(gh pr comment * /crysk override*)",
  "mcp__kaneo__delete_task",
  "mcp__kaneo__delete_label",
  "mcp__kaneo__delete_task_comment",
  "mcp__kaneo__delete_task_relation",
  "mcp__kaneo__move_task",
  "mcp__kaneo__create_project",
  "mcp__kaneo__update_project",
];

interface TasksPage {
  tasks: Task[];
  totalPages: number;
  relatedTotalPages: number;
}

// ---------- response parsing (the API returns unknown JSON, so we narrow it by hand) ----------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPriority(value: unknown): value is Priority {
  return typeof value === "string" && (PRIORITY_ORDER as readonly string[]).includes(value);
}

function parseTask(raw: unknown): Task {
  if (
    !isRecord(raw) ||
    typeof raw.id !== "string" ||
    typeof raw.number !== "number" ||
    typeof raw.title !== "string" ||
    typeof raw.status !== "string" ||
    !Array.isArray(raw.labels)
  ) {
    throw new Error(`Unexpected task shape: ${JSON.stringify(raw).slice(0, 200)}`);
  }
  const parsedLabels = raw.labels.flatMap((label: unknown) =>
    isRecord(label) && typeof label.name === "string" && typeof label.id === "string"
      ? [{ id: label.id, name: label.name }]
      : [],
  );
  return {
    id: raw.id,
    number: raw.number,
    title: raw.title,
    status: raw.status,
    priority: isPriority(raw.priority) ? raw.priority : "no-priority",
    labels: parsedLabels.map((label) => label.name),
    agentLabelId: parsedLabels.find((label) => label.name === AGENT_LABEL)?.id ?? null,
  };
}

function parseTasksPage(body: unknown): TasksPage {
  if (!isRecord(body) || !isRecord(body.data) || !Array.isArray(body.data.columns)) {
    throw new Error("Unexpected response: missing data.columns");
  }
  const tasks: Task[] = [];
  for (const column of body.data.columns) {
    if (!isRecord(column) || !Array.isArray(column.tasks)) {
      throw new Error("Unexpected response: column without tasks");
    }
    tasks.push(...column.tasks.map(parseTask));
  }
  const pagination = isRecord(body.pagination) ? body.pagination : {};
  return {
    tasks,
    totalPages: typeof pagination.totalPages === "number" ? pagination.totalPages : 1,
    relatedTotalPages:
      typeof pagination.relatedTotalPages === "number" ? pagination.relatedTotalPages : 1,
  };
}

/** Keeps only `blocks` relations. Kaneo stores them as "source blocks target". */
function parseBlocks(body: unknown): Block[] {
  if (!Array.isArray(body)) throw new Error("Unexpected response: relations is not an array");
  return body.flatMap((raw: unknown) => {
    if (
      !isRecord(raw) ||
      typeof raw.sourceTaskId !== "string" ||
      typeof raw.targetTaskId !== "string" ||
      typeof raw.relationType !== "string"
    ) {
      throw new Error(`Unexpected relation shape: ${JSON.stringify(raw).slice(0, 200)}`);
    }
    return raw.relationType === "blocks"
      ? [{ blockerId: raw.sourceTaskId, blockedId: raw.targetTaskId }]
      : [];
  });
}

// ---------- Kaneo API ----------

async function getJson(apiKey: string, path: string): Promise<unknown> {
  const url = `${KANEO_URL}/api${path}`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
  if (!response.ok) {
    throw new Error(`GET ${url} failed: HTTP ${response.status}`);
  }
  return response.json();
}

async function send(
  apiKey: string,
  method: "POST" | "PUT" | "DELETE",
  path: string,
  body?: Record<string, string>,
): Promise<void> {
  const url = `${KANEO_URL}/api${path}`;
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) {
    throw new Error(`${method} ${url} failed: HTTP ${response.status} ${await response.text()}`);
  }
}

async function fetchTaskStatus(apiKey: string, taskId: string): Promise<string> {
  const body = await getJson(apiKey, `/task/${taskId}`);
  if (!isRecord(body) || typeof body.status !== "string") {
    throw new Error(`Unexpected response for task ${taskId}: missing status`);
  }
  return body.status;
}

/** The task's pull request, from the links the dispatcher stores in Kaneo. */
async function fetchPrUrl(apiKey: string, taskId: string): Promise<string | null> {
  const body = await getJson(apiKey, `/external-link/task/${taskId}`);
  if (!Array.isArray(body)) return null;
  const link = body.find(
    (raw: unknown) => isRecord(raw) && raw.resourceType === "pull_request" && typeof raw.url === "string",
  );
  return isRecord(link) && typeof link.url === "string" ? link.url : null;
}

async function fetchBlocks(apiKey: string): Promise<Block[]> {
  return parseBlocks(await getJson(apiKey, `/task-relation/project/${PROJECT_ID}`));
}

async function fetchTasksPage(apiKey: string, page: number): Promise<TasksPage> {
  return parseTasksPage(await getJson(apiKey, `/task/tasks/${PROJECT_ID}?limit=100&page=${page}`));
}

async function fetchAllTasks(apiKey: string): Promise<Task[]> {
  const first = await fetchTasksPage(apiKey, 1);
  if (first.relatedTotalPages > 1) {
    // Labels come in a separate "related" page. Until we need it, fail loudly
    // instead of silently missing an `agent-task` label.
    throw new Error("Labels span more than one related page, which is not supported yet");
  }
  const tasks = [...first.tasks];
  for (let page = 2; page <= first.totalPages; page++) {
    tasks.push(...(await fetchTasksPage(apiKey, page)).tasks);
  }
  return tasks;
}

async function comment(apiKey: string, task: Task, content: string): Promise<void> {
  await send(apiKey, "POST", `/comment/${task.id}`, { content });
}

async function setStatus(apiKey: string, task: Task, status: string): Promise<void> {
  await send(apiKey, "PUT", `/task/status/${task.id}`, { status });
}

async function removeAgentLabel(apiKey: string, task: Task): Promise<void> {
  if (task.agentLabelId) await send(apiKey, "DELETE", `/label/${task.agentLabelId}/task`);
}

// ---------- shell helpers (git, gh, crysk) ----------

/** Runs a command and resolves with stdout even when it exits non-zero (some CLIs report through exit codes). */
function run(cmd: string, args: string[], cwd: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { cwd, maxBuffer: 32 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error && typeof error.code !== "number") {
        reject(error); // the command could not start at all
        return;
      }
      resolve({ code: typeof error?.code === "number" ? error.code : 0, stdout, stderr });
    });
  });
}

async function prState(repoRoot: string, pr: number): Promise<string> {
  const result = await run("gh", ["pr", "view", String(pr), "--json", "state", "--jq", ".state"], repoRoot);
  if (result.code !== 0) throw new Error(`gh pr view ${pr} failed: ${result.stderr.trim()}`);
  return result.stdout.trim(); // OPEN, MERGED or CLOSED
}

/** `crysk status --json` for a PR. With `wait`, blocks until the running review ends (Crysk caps it at 90 min). */
async function cryskStatus(repoRoot: string, pr: number, wait: boolean) {
  const args = ["-y", "crysk", "status", "--pr", String(pr), "--json", ...(wait ? ["--wait"] : [])];
  const result = await run("npx", args, repoRoot);
  try {
    return parseCryskStatus(JSON.parse(result.stdout));
  } catch {
    throw new Error(`crysk status --pr ${pr} gave no usable JSON (exit ${result.code}): ${result.stderr.trim().slice(-300)}`);
  }
}

// ---------- agent launch ----------

function isArea(label: string): label is Area {
  return (AREA_LABELS as readonly string[]).includes(label);
}

/** "Agregar adaptador para CarOne (carone.com.ar)" -> "agregar-adaptador-para-carone-carone-com-ar" (max 40 chars). */
function slugify(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 40)
    .replace(/^-+|-+$/g, "");
}

interface AgentRun {
  branch: string;
  worktree: string;
  prompt: string;
  args: string[];
}

function worktreesDirOf(repoRoot: string): string {
  return join(repoRoot, "..", `${basename(repoRoot)}-worktrees`);
}

function worktreeOf(repoRoot: string, task: Task): string {
  return join(worktreesDirOf(repoRoot), `CW-${task.number}`);
}

function planAgentRun(task: Task, repoRoot: string, prUrl: string | null): AgentRun {
  const branch = `agent/CW-${task.number}-${slugify(task.title)}`;
  const worktree = worktreeOf(repoRoot, task);
  const areas = task.labels.filter(isArea);
  const scope =
    areas.length > 0
      ? [...new Set(areas.flatMap((area) => AREA_DIRS[area]))].map((dir) => `\`${dir}\``).join(", ")
      : "todo el repo, salvo `.github/`";

  const values: Record<string, string> = {
    TASK_NUMBER: String(task.number),
    TASK_ID: task.id,
    TASK_TITLE: task.title,
    BRANCH: branch,
    WORKTREE: worktree,
    REPO: repoRoot,
    SCOPE: scope,
    PR: prUrl ?? "ninguno",
  };
  const template = readFileSync(join(repoRoot, "tools", "factory", "agent-prompt.md"), "utf8");
  const prompt = template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    const value = values[key];
    if (value === undefined) throw new Error(`Unknown placeholder ${match} in agent-prompt.md`);
    return value;
  });

  const args = [
    "-p",
    prompt,
    "--output-format",
    "json",
    "--permission-mode",
    "dontAsk",
    "--add-dir",
    worktreesDirOf(repoRoot),
    "--allowedTools",
    ...ALLOWED_TOOLS,
    "--disallowedTools",
    ...DISALLOWED_TOOLS,
  ];
  return { branch, worktree, prompt, args };
}

interface AgentResult {
  isError: boolean;
  numTurns: number | null;
  prUrl: string | null;
  summary: string;
}

/** Reads `claude -p --output-format json` output. The prompt asks the agent to end with "PR_URL: <url|none>". */
function parseAgentOutput(stdout: string): AgentResult {
  let body: unknown;
  try {
    body = JSON.parse(stdout);
  } catch {
    return { isError: true, numTurns: null, prUrl: null, summary: stdout.slice(-500) };
  }
  if (!isRecord(body)) return { isError: true, numTurns: null, prUrl: null, summary: "non-object output" };
  const result = typeof body.result === "string" ? body.result : "";
  const prMatch = /^PR_URL:\s*(\S+)\s*$/m.exec(result);
  const prUrl = prMatch?.[1] && prMatch[1] !== "none" ? prMatch[1] : null;
  return {
    isError: body.is_error === true,
    numTurns: typeof body.num_turns === "number" ? body.num_turns : null,
    prUrl,
    summary: result.slice(-500),
  };
}

function runAgent(agentRun: AgentRun, repoRoot: string, onStart: (pid: number) => void): Promise<AgentResult> {
  return new Promise((resolve, reject) => {
    const child = spawn("claude", agentRun.args, {
      cwd: repoRoot, // the Kaneo MCP server is configured with local scope for this folder
      stdio: ["ignore", "pipe", "inherit"],
      timeout: AGENT_TIMEOUT_MS,
    });
    if (child.pid !== undefined) onStart(child.pid);
    let stdout = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (signal) {
        reject(new Error(`claude was killed by ${signal} (timeout is ${AGENT_TIMEOUT_MS / 60000} min)`));
        return;
      }
      const result = parseAgentOutput(stdout);
      resolve(code === 0 ? result : { ...result, isError: true });
    });
  });
}

// ---------- running-agents registry (read by the factory UI) ----------

function runningAgentFile(runsDir: string, task: Task): string {
  return join(runsDir, `CW-${task.number}.json`);
}

/**
 * One file per running agent, removed when the agent ends. If the dispatcher is killed the file
 * stays behind, so readers must check that `pid` is still alive.
 */
function registerRunningAgent(runsDir: string, task: Task, agentRun: AgentRun, pid: number): void {
  const agent: RunningAgent = {
    taskNumber: task.number,
    taskId: task.id,
    taskTitle: task.title,
    branch: agentRun.branch,
    worktree: agentRun.worktree,
    pid,
    startedAt: new Date().toISOString(),
  };
  mkdirSync(runsDir, { recursive: true });
  writeFileSync(runningAgentFile(runsDir, task), JSON.stringify(agent, null, 2));
}

// ---------- outcomes: merge, close, escalate ----------

async function removeWorktree(repoRoot: string, task: Task): Promise<void> {
  const worktree = worktreeOf(repoRoot, task);
  if (!existsSync(worktree)) return;
  const result = await run("git", ["worktree", "remove", "--force", worktree], repoRoot);
  if (result.code !== 0) console.error(`  no se pudo borrar el worktree ${worktree}: ${result.stderr.trim()}`);
}

/** The PR was merged (by us or by hand): the task is done and its worktree goes away. */
async function closeDone(apiKey: string, repoRoot: string, task: Task, pr: number, how: string): Promise<void> {
  await removeWorktree(repoRoot, task);
  await setStatus(apiKey, task, DONE_STATUS);
  await comment(apiKey, task, how);
  console.log(`  CW-${task.number} pasó a ${DONE_STATUS} (PR #${pr})`);
}

/**
 * Escalates to a human: comment in Kaneo, task stays in in-review without `agent-task` (so no agent
 * takes it again), desktop notification and a mention on the PR.
 */
async function escalate(apiKey: string, repoRoot: string, task: Task, pr: number | null, reason: string): Promise<void> {
  const prText = pr ? ` PR #${pr}.` : "";
  await comment(
    apiKey,
    task,
    `Necesita revisión humana: ${reason}.${prText} El dispatcher no mergeó, dejó la task en ` +
      `${IN_REVIEW_STATUS} y le sacó \`${AGENT_LABEL}\`. Para que un agente la retome, volvé a ponérselo.`,
  );
  await setStatus(apiKey, task, IN_REVIEW_STATUS);
  await removeAgentLabel(apiKey, task);
  console.log(`  CW-${task.number} escalada: ${reason}`);

  const notify = await run("notify-send", ["--urgency=critical", `Factory: CW-${task.number} necesita revisión`, reason], repoRoot).catch(
    (error: unknown) => ({ code: 1, stdout: "", stderr: String(error) }),
  );
  if (notify.code !== 0) console.error(`  notify-send falló: ${notify.stderr.trim()}`);

  if (pr) {
    const user = process.env.FACTORY_NOTIFY_GITHUB_USER ?? (await run("gh", ["api", "user", "--jq", ".login"], repoRoot)).stdout.trim();
    const mention = user ? `@${user} ` : "";
    const body = `${mention}la factory no pudo cerrar este PR sola: ${reason}. Necesita revisión humana.`;
    const posted = await run("gh", ["pr", "comment", String(pr), "--body", body], repoRoot);
    if (posted.code !== 0) console.error(`  no se pudo comentar el PR #${pr}: ${posted.stderr.trim()}`);
  }
}

/** Squash-merges the PR, deletes its branch and closes the task. A failed merge escalates. */
async function mergePr(apiKey: string, repoRoot: string, task: Task, pr: number, openSuggestions: string[]): Promise<void> {
  // The branch is checked out in the worktree, and git refuses to delete a branch in use.
  await removeWorktree(repoRoot, task);
  const merged = await run("gh", ["pr", "merge", String(pr), "--squash", "--delete-branch"], repoRoot);
  if (merged.code !== 0) {
    await escalate(apiKey, repoRoot, task, pr, `el merge falló (${merged.stderr.trim().slice(-200)})`);
    return;
  }
  const pending =
    openSuggestions.length > 0
      ? ` Quedaron sin responder hallazgos menores que no bloquean: ${openSuggestions.join(", ")}.`
      : "";
  await closeDone(apiKey, repoRoot, task, pr, `Mergeado por el dispatcher: la revisión de Crysk no dejó hallazgos bloqueantes (PR #${pr}).${pending}`);
}

async function applyReviewAction(apiKey: string, repoRoot: string, task: Task, pr: number, action: ReviewAction): Promise<void> {
  switch (action.kind) {
    case "merge":
      await mergePr(apiKey, repoRoot, task, pr, action.openSuggestions);
      break;
    case "escalate":
      await escalate(apiKey, repoRoot, task, pr, action.reason);
      break;
    case "wait":
    case "fix":
      break; // handled by the caller
  }
}

/** Old safety net: no PR at all. The task goes back to to-do without `agent-task`. */
async function returnToReady(apiKey: string, task: Task, reason: string): Promise<void> {
  await comment(
    apiKey,
    task,
    `Necesita humano: ${reason}. El dispatcher la dejó en ${READY_STATUS} y le sacó el label ` +
      `\`${AGENT_LABEL}\`. Para reintentar con el agente, volvé a ponérselo.`,
  );
  await setStatus(apiKey, task, READY_STATUS);
  await removeAgentLabel(apiKey, task);
  console.log(`  CW-${task.number} necesita humano: ${reason}`);
}

/**
 * Runs after every agent run, whatever happened.
 * - No PR: back to to-do without `agent-task` (the agent stopped or crashed before opening one).
 * - PR: wait for Crysk to settle, then merge or escalate. The agent already ran its loop.
 */
async function afterAgent(
  apiKey: string,
  repoRoot: string,
  task: Task,
  prUrl: string | null,
  isNewPr: boolean,
  failure: string | null,
): Promise<void> {
  const pr = prUrl ? prNumberFromUrl(prUrl) : null;
  if (prUrl && isNewPr) {
    await send(apiKey, "POST", `/external-link/task/${task.id}`, {
      url: prUrl,
      title: `Pull request ${pr ?? ""}`.trim(),
      resourceType: "pull_request",
    });
    console.log(`  PR vinculado en Kaneo: ${prUrl}`);
  }

  if (pr === null) {
    const status = await fetchTaskStatus(apiKey, task.id);
    const reason =
      failure ??
      (status === READY_STATUS
        ? "el agente frenó y devolvió la task (ver sus comentarios)"
        : `el agente terminó con la task en ${status} y sin PR`);
    await returnToReady(apiKey, task, reason);
    return;
  }

  if (failure) {
    await escalate(apiKey, repoRoot, task, pr, failure);
    return;
  }
  console.log(`  esperando el veredicto de Crysk sobre el PR #${pr}...`);
  const action = decideReview(await cryskStatus(repoRoot, pr, true), true);
  await applyReviewAction(apiKey, repoRoot, task, pr, action);
}

function describe(task: Task): string {
  const areas = task.labels.filter(isArea);
  const scope = areas.length > 0 ? areas.join(", ") : "sin área (todo el repo)";
  return `CW-${task.number} "${task.title}" [${task.priority}] (${scope})`;
}

// ---------- main ----------

interface OpenPr {
  url: string;
  number: number;
}

/**
 * Step 1: settle the PRs of agent tasks in in-review. Merges and closes happen here; PRs whose
 * findings need the agent are returned so the selection can give them priority.
 */
async function settleOpenPrs(apiKey: string, repoRoot: string, tasks: Task[], dryRun: boolean): Promise<Map<string, OpenPr>> {
  const needsFix = new Map<string, OpenPr>();
  for (const task of tasks.filter((t) => isAgentTask(t) && t.status === IN_REVIEW_STATUS)) {
    const url = await fetchPrUrl(apiKey, task.id);
    const pr = url ? prNumberFromUrl(url) : null;
    if (!url || pr === null) {
      console.log(`  CW-${task.number} está en ${IN_REVIEW_STATUS} sin PR vinculado: la salteo`);
      continue;
    }
    const state = await prState(repoRoot, pr);
    if (state === "MERGED") {
      if (dryRun) console.log(`  [dry-run] CW-${task.number}: PR #${pr} ya mergeado, pasaría a ${DONE_STATUS}`);
      else await closeDone(apiKey, repoRoot, task, pr, `El PR #${pr} se mergeó: la task pasa a ${DONE_STATUS}.`);
      continue;
    }
    if (state !== "OPEN") {
      console.log(`  CW-${task.number}: el PR #${pr} está ${state}, lo dejo para un humano`);
      continue;
    }
    const action = decideReview(await cryskStatus(repoRoot, pr, false), false);
    console.log(`  CW-${task.number}: PR #${pr} -> ${action.kind}`);
    if (action.kind === "fix") needsFix.set(task.id, { url, number: pr });
    else if (action.kind !== "wait" && !dryRun) await applyReviewAction(apiKey, repoRoot, task, pr, action);
  }
  return needsFix;
}

async function tick(apiKey: string, dryRun: boolean): Promise<void> {
  const repoRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
  const [tasks, blocks] = await Promise.all([fetchAllTasks(apiKey), fetchBlocks(apiKey)]);
  const now = new Date().toISOString();

  const needsFix = await settleOpenPrs(apiKey, repoRoot, tasks, dryRun);
  // Merges and closes above may have changed statuses (and unblocked tasks), so read them again.
  const current = dryRun ? tasks : await fetchAllTasks(apiKey);
  const decision = decide(current, blocks, new Set(needsFix.keys()));

  if (decision.kind !== "busy") {
    for (const { task, blockers } of decision.skipped) {
      console.log(`${now} salteo CW-${task.number}: bloqueada por ${blockers.join(", ")}`);
    }
  }
  if (decision.kind === "busy") {
    console.log(`${now} ocupado: ya está en curso ${describe(decision.running)}`);
    return;
  }
  if (decision.kind === "idle") {
    console.log(`${now} nada para tomar (ninguna task en ${READY_STATUS} con ${AGENT_LABEL} está libre)`);
    return;
  }

  const task = decision.task;
  const existingPr = decision.kind === "review" ? (needsFix.get(task.id) ?? null) : null;
  const agentRun = planAgentRun(task, repoRoot, existingPr?.url ?? null);
  const what = decision.kind === "review" ? `corregir la revisión del PR #${existingPr?.number}` : "implementar";
  if (dryRun) {
    console.log(`${now} [dry-run] lanzaría el agente para ${what}: ${describe(task)}`);
    console.log(`  rama: ${agentRun.branch}\n  worktree: ${agentRun.worktree}`);
    console.log(`  claude ${agentRun.args.filter((arg) => arg !== agentRun.prompt).map((arg) => JSON.stringify(arg)).join(" ")}`);
    console.log(`  --- prompt ---\n${agentRun.prompt}`);
    return;
  }

  mkdirSync(worktreesDirOf(repoRoot), { recursive: true });
  console.log(`${now} lanzando agente para ${what}: ${describe(task)} en ${agentRun.worktree}`);
  let prUrl: string | null = existingPr?.url ?? null;
  let failure: string | null = null;
  const runsDir = join(repoRoot, "tools", "factory", "runs");
  try {
    const result = await runAgent(agentRun, repoRoot, (pid) => registerRunningAgent(runsDir, task, agentRun, pid));
    console.log(
      `${new Date().toISOString()} agente terminó: error=${result.isError} turnos=${result.numTurns ?? "?"} PR=${result.prUrl ?? "ninguno"}`,
    );
    console.log(result.summary);
    prUrl = result.prUrl ?? prUrl;
    if (result.isError) failure = "la ejecución del agente terminó con error";
  } catch (error) {
    failure = `el agente no terminó (${error instanceof Error ? error.message : String(error)})`;
    console.error(`${new Date().toISOString()} ${failure}`);
  } finally {
    rmSync(runningAgentFile(runsDir, task), { force: true });
  }
  await afterAgent(apiKey, repoRoot, task, prUrl, existingPr === null, failure);
}

function loadApiKey(): string {
  try {
    process.loadEnvFile(ENV_FILE);
  } catch {
    throw new Error(`Could not read ${ENV_FILE}`);
  }
  const apiKey = process.env.KANEO_API_KEY;
  if (!apiKey) throw new Error(`KANEO_API_KEY is not set in ${ENV_FILE}`);
  return apiKey;
}

interface Options {
  intervalSeconds: number | null;
  dryRun: boolean;
}

function parseOptions(): Options {
  const { values } = parseArgs({
    options: { interval: { type: "string" }, "dry-run": { type: "boolean", default: false } },
  });
  const dryRun = values["dry-run"];
  if (values.interval === undefined) return { intervalSeconds: null, dryRun };
  const seconds = Number(values.interval);
  if (!Number.isInteger(seconds) || seconds < 10) {
    throw new Error("--interval must be an integer of at least 10 seconds");
  }
  return { intervalSeconds: seconds, dryRun };
}

async function main(): Promise<void> {
  const { intervalSeconds, dryRun } = parseOptions();
  const apiKey = loadApiKey();

  if (intervalSeconds === null) {
    await tick(apiKey, dryRun);
    return;
  }

  console.log(`Polling cada ${intervalSeconds}s (Ctrl+C para cortar)`);
  for (;;) {
    try {
      await tick(apiKey, dryRun);
    } catch (error) {
      // In loop mode a failed poll (e.g. Kaneo restarting) should not kill the process.
      console.error(`${new Date().toISOString()} error:`, error instanceof Error ? error.message : error);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalSeconds * 1000));
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
