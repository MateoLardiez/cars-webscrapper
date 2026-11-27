import { describe, expect, it } from "vitest";
import { formatElapsed, parseRunningAgent } from "./runningAgent";

const START = "2026-11-27T10:00:00.000Z";
const at = (minutes: number) => Date.parse(START) + minutes * 60_000;

describe("formatElapsed", () => {
  it.each([
    [0, "menos de 1 min"],
    [0.5, "menos de 1 min"],
    [12, "12 min"],
    [59, "59 min"],
    [60, "1 h 00 min"],
    [65, "1 h 05 min"],
    [-3, "menos de 1 min"], // clock skew: never negative
  ])("%s minutes -> %s", (minutes, expected) => {
    expect(formatElapsed(START, at(minutes))).toBe(expected);
  });
});

describe("parseRunningAgent", () => {
  const valid = {
    taskNumber: 7,
    taskId: "abc",
    taskTitle: "Agregar adaptador",
    branch: "agent/CW-7-agregar-adaptador",
    worktree: "/tmp/CW-7",
    pid: 123,
    startedAt: START,
  };

  it("accepts a complete agent", () => {
    expect(parseRunningAgent(valid)).toEqual(valid);
  });

  it.each([null, "x", { ...valid, pid: "123" }, { ...valid, startedAt: "not a date" }])(
    "rejects %j",
    (raw) => {
      expect(parseRunningAgent(raw)).toBeNull();
    },
  );
});
