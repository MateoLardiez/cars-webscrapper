/** An agent the dispatcher launched and that is still running. Written by tools/factory/dispatcher.ts. */
export interface RunningAgent {
  taskNumber: number;
  taskId: string;
  taskTitle: string;
  branch: string;
  worktree: string;
  pid: number;
  startedAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Narrows unknown JSON to a RunningAgent, or returns null if any field is missing or has the wrong type. */
export function parseRunningAgent(raw: unknown): RunningAgent | null {
  if (
    !isRecord(raw) ||
    typeof raw.taskNumber !== "number" ||
    typeof raw.taskId !== "string" ||
    typeof raw.taskTitle !== "string" ||
    typeof raw.branch !== "string" ||
    typeof raw.worktree !== "string" ||
    typeof raw.pid !== "number" ||
    typeof raw.startedAt !== "string" ||
    Number.isNaN(Date.parse(raw.startedAt))
  ) {
    return null;
  }
  return {
    taskNumber: raw.taskNumber,
    taskId: raw.taskId,
    taskTitle: raw.taskTitle,
    branch: raw.branch,
    worktree: raw.worktree,
    pid: raw.pid,
    startedAt: raw.startedAt,
  };
}

/** "menos de 1 min", "12 min", "1 h 05 min". */
export function formatElapsed(startedAt: string, nowMs: number): string {
  const minutes = Math.max(0, Math.floor((nowMs - Date.parse(startedAt)) / 60_000));
  if (minutes < 1) return "menos de 1 min";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h ${String(minutes % 60).padStart(2, "0")} min`;
}
