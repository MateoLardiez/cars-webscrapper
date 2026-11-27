/**
 * Pure task selection for the dispatcher: which Kaneo task the next agent works on.
 * No I/O here, so the rules are easy to test.
 */

export const AGENT_LABEL = "agent-task";
export const READY_STATUS = "to-do";
export const IN_PROGRESS_STATUS = "in-progress";
export const IN_REVIEW_STATUS = "in-review";
export const DONE_STATUS = "done";

export const PRIORITY_ORDER = ["urgent", "high", "medium", "low", "no-priority"] as const;
export type Priority = (typeof PRIORITY_ORDER)[number];

export interface Task {
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
export interface Block {
  blockerId: string;
  blockedId: string;
}

export interface Skipped {
  task: Task;
  /** Human-readable names of the unfinished blockers, e.g. "CW-10 (to-do)". */
  blockers: string[];
}

export type Decision =
  | { kind: "busy"; running: Task }
  | { kind: "idle"; skipped: Skipped[] }
  /** The task already has a PR with findings to fix: run the agent's review loop on it. */
  | { kind: "review"; task: Task; skipped: Skipped[] }
  /** A new task: the agent implements it and opens a PR. */
  | { kind: "implement"; task: Task; skipped: Skipped[] };

export function isAgentTask(task: Task): boolean {
  return task.labels.includes(AGENT_LABEL);
}

function byPriorityThenNumber(a: Task, b: Task): number {
  const priorityDiff = PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority);
  return priorityDiff !== 0 ? priorityDiff : a.number - b.number;
}

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

/**
 * One agent at a time. Finishing open PRs comes before starting new tasks.
 * @param needsFix ids of in-review agent tasks whose PR has findings the agent should fix.
 */
export function decide(tasks: Task[], blocks: Block[], needsFix: ReadonlySet<string>): Decision {
  const running = tasks.find((task) => isAgentTask(task) && task.status === IN_PROGRESS_STATUS);
  if (running) return { kind: "busy", running };

  const [toReview] = tasks
    .filter((task) => isAgentTask(task) && task.status === IN_REVIEW_STATUS && needsFix.has(task.id))
    .sort(byPriorityThenNumber);
  if (toReview) return { kind: "review", task: toReview, skipped: [] };

  const tasksById = new Map(tasks.map((task) => [task.id, task]));
  const candidates = tasks
    .filter((task) => isAgentTask(task) && task.status === READY_STATUS)
    .sort(byPriorityThenNumber);

  const skipped: Skipped[] = [];
  for (const task of candidates) {
    const blockers = unfinishedBlockers(task, blocks, tasksById);
    if (blockers.length === 0) return { kind: "implement", task, skipped };
    skipped.push({ task, blockers });
  }
  return { kind: "idle", skipped };
}
