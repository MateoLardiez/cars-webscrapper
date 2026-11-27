/**
 * Dispatcher of the software factory: picks the next Kaneo task an agent should work on.
 *
 * Rule: a task is eligible when it is in the `to-do` column and has the `agent-task` label.
 * Concurrency is 1: if an `agent-task` is already `in-progress`, nothing is picked.
 * A task blocked (Kaneo "blocks" relation) by a task that is not `done` is skipped.
 *
 * For the picked task it launches a headless Claude Code agent (`claude -p`, prompt in
 * agent-prompt.md) that claims the task, creates a worktree, implements it and opens a PR.
 * The dispatcher waits for the agent to finish before the next poll.
 * With --dry-run it only prints the agent command and prompt, and changes nothing.
 *
 * Usage:
 *   npx tsx tools/factory/dispatcher.ts                 # run once and exit
 *   npx tsx tools/factory/dispatcher.ts --interval 90   # run every 90 seconds
 *   npx tsx tools/factory/dispatcher.ts --dry-run       # print only, write nothing
 */
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { parseArgs } from "node:util";

const KANEO_URL = process.env.KANEO_URL ?? "http://localhost:5173";
const PROJECT_ID = process.env.KANEO_PROJECT_ID ?? "zqkq7jtldcvxardzfsdyka33";
const ENV_FILE = join(homedir(), ".config", "factory", "kaneo.env");

const AGENT_LABEL = "agent-task";
const READY_STATUS = "to-do";
const IN_PROGRESS_STATUS = "in-progress";
const IN_REVIEW_STATUS = "in-review";
const DONE_STATUS = "done";
const AREA_LABELS = ["backend", "frontend", "scrapling"] as const;
type Area = (typeof AREA_LABELS)[number];

/** Folders an agent may modify for each area label. A task without area labels may touch the whole repo. */
const AREA_DIRS: Record<Area, string[]> = {
  backend: ["apps/backend", "apps/shared"],
  frontend: ["apps/frontend", "apps/shared"],
  scrapling: ["tools/scrapling", "apps/shared"],
};

const AGENT_TIMEOUT_MS = 90 * 60 * 1000;

const ALLOWED_TOOLS = [
  "Read",
  "Edit",
  "Write",
  "Glob",
  "Grep",
  "Bash(git *)",
  "Bash(gh pr create *)",
  "Bash(gh pr view *)",
  "Bash(npm *)",
  "Bash(npx *)",
  "Bash(uv *)",
  "Bash(cd *)",
  "Bash(ls *)",
  "mcp__kaneo",
];

// Prefix-based deny rules are a seatbelt, not a guarantee: the real protection for main
// is GitHub branch protection (step 7).
const DISALLOWED_TOOLS = [
  "Bash(git push --force *)",
  "Bash(git push -f *)",
  "Bash(git push origin main *)",
  "Bash(git reset --hard *)",
  "mcp__kaneo__delete_task",
  "mcp__kaneo__delete_label",
  "mcp__kaneo__delete_task_comment",
  "mcp__kaneo__delete_task_relation",
  "mcp__kaneo__move_task",
  "mcp__kaneo__create_project",
  "mcp__kaneo__update_project",
];

const PRIORITY_ORDER = ["urgent", "high", "medium", "low", "no-priority"] as const;
type Priority = (typeof PRIORITY_ORDER)[number];

interface Task {
  id: string;
  number: number;
  title: string;
  status: string;
  priority: Priority;
  labels: string[];
  /** Id of this task's own copy of the `agent-task` label (Kaneo copies labels per task). */
  agentLabelId: string | null;
}

/** `blockerId` must be done before `blockedId` can be picked. */
interface Block {
  blockerId: string;
  blockedId: string;
}

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

// ---------- selection ----------

function isAgentTask(task: Task): boolean {
  return task.labels.includes(AGENT_LABEL);
}

function areasOf(task: Task): string[] {
  return task.labels.filter((label) => (AREA_LABELS as readonly string[]).includes(label));
}

function byPriorityThenNumber(a: Task, b: Task): number {
  const priorityDiff = PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority);
  return priorityDiff !== 0 ? priorityDiff : a.number - b.number;
}

interface Skipped {
  task: Task;
  /** Human-readable names of the unfinished blockers, e.g. "CW-10 (to-do)". */
  blockers: string[];
}

type Decision =
  | { kind: "busy"; running: Task }
  | { kind: "idle"; skipped: Skipped[] }
  | { kind: "pick"; task: Task; skipped: Skipped[] };

/** Names of the tasks that block `task` and are not done. A blocker we cannot find counts as unfinished. */
function unfinishedBlockers(task: Task, blocks: Block[], tasksById: Map<string, Task>): string[] {
  return blocks
    .filter((block) => block.blockedId === task.id)
    .flatMap((block) => {
      const blocker = tasksById.get(block.blockerId);
      if (!blocker) return [`${block.blockerId} (no encontrada)`];
      return blocker.status === DONE_STATUS ? [] : [`CW-${blocker.number} (${blocker.status})`];
    });
}

function decide(tasks: Task[], blocks: Block[]): Decision {
  const running = tasks.find((task) => isAgentTask(task) && task.status === IN_PROGRESS_STATUS);
  if (running) return { kind: "busy", running };

  const tasksById = new Map(tasks.map((task) => [task.id, task]));
  const candidates = tasks
    .filter((task) => isAgentTask(task) && task.status === READY_STATUS)
    .sort(byPriorityThenNumber);

  const skipped: Skipped[] = [];
  for (const task of candidates) {
    const blockers = unfinishedBlockers(task, blocks, tasksById);
    if (blockers.length === 0) return { kind: "pick", task, skipped };
    skipped.push({ task, blockers });
  }
  return { kind: "idle", skipped };
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

function planAgentRun(task: Task, repoRoot: string, worktreesDir: string): AgentRun {
  const branch = `agent/CW-${task.number}-${slugify(task.title)}`;
  const worktree = join(worktreesDir, `CW-${task.number}`);
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
    worktreesDir,
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

function runAgent(run: AgentRun, repoRoot: string): Promise<AgentResult> {
  return new Promise((resolve, reject) => {
    const child = spawn("claude", run.args, {
      cwd: repoRoot, // the Kaneo MCP server is configured with local scope for this folder
      stdio: ["ignore", "pipe", "inherit"],
      timeout: AGENT_TIMEOUT_MS,
    });
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

// ---------- after the agent (deterministic safety net) ----------

/**
 * Runs after every agent run, whatever happened.
 * - Links the PR in Kaneo when the agent reported one.
 * - Unless the task ended in in-review with a PR, it comments "Necesita humano", moves the task
 *   back to to-do and removes `agent-task`, so the next poll does not pick it again in a loop.
 */
async function afterAgent(apiKey: string, task: Task, prUrl: string | null, failure: string | null): Promise<void> {
  const status = await fetchTaskStatus(apiKey, task.id);

  if (prUrl) {
    await send(apiKey, "POST", `/external-link/task/${task.id}`, {
      url: prUrl,
      title: `Pull request ${prUrl.split("/").pop() ?? ""}`.trim(),
      resourceType: "pull_request",
    });
    console.log(`  PR vinculado en Kaneo: ${prUrl}`);
  }

  if (failure === null && status === IN_REVIEW_STATUS && prUrl) {
    console.log(`  CW-${task.number} quedó en ${IN_REVIEW_STATUS}`);
    return;
  }

  const reason =
    failure ??
    (status === READY_STATUS
      ? "el agente frenó y devolvió la task (ver sus comentarios)"
      : status === IN_REVIEW_STATUS
        ? "la task quedó en in-review pero el agente no reportó un PR"
        : `el agente terminó con la task en ${status}`);
  await send(apiKey, "POST", `/comment/${task.id}`, {
    content:
      `Necesita humano: ${reason}. El dispatcher la dejó en ${READY_STATUS} y le sacó el label ` +
      `\`${AGENT_LABEL}\`. Para reintentar con el agente, volvé a ponérselo.`,
  });
  if (status !== READY_STATUS) {
    await send(apiKey, "PUT", `/task/status/${task.id}`, { status: READY_STATUS });
  }
  if (task.agentLabelId) {
    await send(apiKey, "DELETE", `/label/${task.agentLabelId}/task`);
  }
  console.log(`  CW-${task.number} necesita humano: ${reason}`);
}

function describe(task: Task): string {
  const areas = areasOf(task);
  const scope = areas.length > 0 ? areas.join(", ") : "sin área (todo el repo)";
  return `CW-${task.number} "${task.title}" [${task.priority}] (${scope})`;
}

// ---------- main ----------

async function tick(apiKey: string, dryRun: boolean): Promise<void> {
  const [tasks, blocks] = await Promise.all([fetchAllTasks(apiKey), fetchBlocks(apiKey)]);
  const decision = decide(tasks, blocks);
  const now = new Date().toISOString();
  if (decision.kind !== "busy") {
    for (const { task, blockers } of decision.skipped) {
      console.log(`${now} salteo CW-${task.number}: bloqueada por ${blockers.join(", ")}`);
    }
  }
  switch (decision.kind) {
    case "busy":
      console.log(`${now} ocupado: ya está en curso ${describe(decision.running)}`);
      break;
    case "idle":
      console.log(`${now} nada para tomar (ninguna task en ${READY_STATUS} con ${AGENT_LABEL} está libre)`);
      break;
    case "pick": {
      const repoRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
      const worktreesDir = join(repoRoot, "..", `${basename(repoRoot)}-worktrees`);
      const run = planAgentRun(decision.task, repoRoot, worktreesDir);
      if (dryRun) {
        console.log(`${now} [dry-run] lanzaría el agente para ${describe(decision.task)}`);
        console.log(`  rama: ${run.branch}\n  worktree: ${run.worktree}`);
        console.log(`  claude ${run.args.filter((arg) => arg !== run.prompt).map((arg) => JSON.stringify(arg)).join(" ")}`);
        console.log(`  --- prompt ---\n${run.prompt}`);
        break;
      }
      mkdirSync(worktreesDir, { recursive: true });
      console.log(`${now} lanzando agente para ${describe(decision.task)} en ${run.worktree}`);
      let prUrl: string | null = null;
      let failure: string | null = null;
      try {
        const result = await runAgent(run, repoRoot);
        console.log(
          `${new Date().toISOString()} agente terminó: error=${result.isError} turnos=${result.numTurns ?? "?"} PR=${result.prUrl ?? "ninguno"}`,
        );
        console.log(result.summary);
        prUrl = result.prUrl;
        if (result.isError) failure = "la ejecución del agente terminó con error";
      } catch (error) {
        failure = `el agente no terminó (${error instanceof Error ? error.message : String(error)})`;
        console.error(`${new Date().toISOString()} ${failure}`);
      }
      await afterAgent(apiKey, decision.task, prUrl, failure);
      break;
    }
  }
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
