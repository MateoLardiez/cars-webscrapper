import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { isProcessAlive, readRunningAgents } from "./runningAgents";

const agent = (taskNumber: number, pid: number, startedAt: string) => ({
  taskNumber,
  taskId: `id-${taskNumber}`,
  taskTitle: `Task ${taskNumber}`,
  branch: `agent/CW-${taskNumber}-task`,
  worktree: `/tmp/worktrees/CW-${taskNumber}`,
  pid,
  startedAt,
});

let dir: string | null = null;
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = null;
});

describe("readRunningAgents", () => {
  it("returns an empty list when the runs folder does not exist", () => {
    expect(readRunningAgents("/nonexistent/factory/runs")).toEqual([]);
  });

  it("returns only valid agents whose process is alive, oldest first", () => {
    dir = mkdtempSync(join(tmpdir(), "factory-runs-"));
    writeFileSync(join(dir, "CW-2.json"), JSON.stringify(agent(2, 200, "2026-11-27T10:05:00.000Z")));
    writeFileSync(join(dir, "CW-1.json"), JSON.stringify(agent(1, 100, "2026-11-27T10:00:00.000Z")));
    writeFileSync(join(dir, "CW-3.json"), JSON.stringify(agent(3, 300, "2026-11-27T10:10:00.000Z"))); // dead pid
    writeFileSync(join(dir, "CW-4.json"), "{ half written");
    writeFileSync(join(dir, "CW-5.json"), JSON.stringify({ taskNumber: 5 })); // missing fields
    writeFileSync(join(dir, "notes.txt"), "not an agent");

    const alive = new Set([100, 200, 400, 500]);
    const agents = readRunningAgents(dir, (pid) => alive.has(pid));

    expect(agents.map((a) => a.taskNumber)).toEqual([1, 2]);
  });
});

describe("isProcessAlive", () => {
  it("is true for the current process and false for a pid that does not exist", () => {
    expect(isProcessAlive(process.pid)).toBe(true);
    expect(isProcessAlive(2 ** 22 + 12345)).toBe(false); // above Linux pid_max
  });
});
