import { describe, expect, it } from "vitest";
import { decide, type Block, type Task } from "./select.ts";

const task = (number: number, status: string, labels = ["agent-task"], priority: Task["priority"] = "medium"): Task => ({
  id: `t${number}`,
  number,
  title: `Task ${number}`,
  status,
  priority,
  labels,
  agentLabelId: labels.includes("agent-task") ? `l${number}` : null,
});

const none = new Set<string>();

describe("decide", () => {
  it("is busy while an agent task is in progress", () => {
    const decision = decide([task(1, "in-progress"), task(2, "to-do")], [], none);
    expect(decision).toMatchObject({ kind: "busy", running: { number: 1 } });
  });

  it("ignores tasks without the agent-task label", () => {
    expect(decide([task(1, "to-do", [])], [], none)).toEqual({ kind: "idle", skipped: [] });
  });

  it("picks the highest priority, then the lowest number", () => {
    const tasks = [task(3, "to-do"), task(2, "to-do"), task(5, "to-do", ["agent-task"], "high")];
    expect(decide(tasks, [], none)).toMatchObject({ kind: "implement", task: { number: 5 } });
  });

  it("skips a task blocked by an unfinished one", () => {
    const tasks = [task(10, "in-review", []), task(11, "to-do"), task(12, "to-do")];
    const blocks: Block[] = [{ blockerId: "t10", blockedId: "t11" }];
    expect(decide(tasks, blocks, none)).toMatchObject({
      kind: "implement",
      task: { number: 12 },
      skipped: [{ task: { number: 11 }, blockers: ["CW-10 (in-review)"] }],
    });
  });

  it("does not skip a task whose blocker is done", () => {
    const tasks = [task(10, "done", []), task(11, "to-do")];
    const blocks: Block[] = [{ blockerId: "t10", blockedId: "t11" }];
    expect(decide(tasks, blocks, none)).toMatchObject({ kind: "implement", task: { number: 11 } });
  });

  it("finishes an open PR with findings before starting a new task", () => {
    const tasks = [task(2, "to-do", ["agent-task"], "urgent"), task(7, "in-review")];
    expect(decide(tasks, [], new Set(["t7"]))).toMatchObject({ kind: "review", task: { number: 7 } });
  });

  it("leaves an in-review task alone when its PR needs nothing", () => {
    const tasks = [task(7, "in-review"), task(8, "to-do")];
    expect(decide(tasks, [], none)).toMatchObject({ kind: "implement", task: { number: 8 } });
  });
});
