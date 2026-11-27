import { describe, expect, it } from "vitest";
import { decideReview, parseCryskStatus, prNumberFromUrl, type CryskStatus } from "./review.ts";

const status = (overrides: Partial<CryskStatus> = {}): CryskStatus => ({
  nextAction: "done",
  unresolvedBlocking: 0,
  findings: [],
  ...overrides,
});

const minor = { id: "R002", severity: "WARNING", blocking: false, needsReply: true };
const critical = { id: "R001", severity: "CRITICAL", blocking: true, needsReply: true };

describe("decideReview before the agent ran", () => {
  it("waits while a review is running", () => {
    expect(decideReview(status({ nextAction: "wait" }), false)).toEqual({ kind: "wait" });
  });

  it("merges a clean, closed loop", () => {
    expect(decideReview(status(), false)).toEqual({ kind: "merge", openSuggestions: [] });
  });

  it("sends the agent to fix blocking findings", () => {
    const s = status({ nextAction: "triage", unresolvedBlocking: 1, findings: [critical] });
    expect(decideReview(s, false)).toEqual({ kind: "fix" });
  });

  it("sends the agent to fix minor findings too, while the loop is open", () => {
    const s = status({ nextAction: "triage", findings: [minor] });
    expect(decideReview(s, false)).toEqual({ kind: "fix" });
  });
});

describe("decideReview after the agent ran its loop", () => {
  it("merges when no blocking finding is left, reporting unanswered minors", () => {
    const s = status({ nextAction: "triage", findings: [minor] });
    expect(decideReview(s, true)).toEqual({ kind: "merge", openSuggestions: ["R002 (WARNING)"] });
  });

  it("escalates when a blocking finding is left", () => {
    const s = status({ nextAction: "fix", unresolvedBlocking: 1, findings: [critical] });
    const action = decideReview(s, true);
    expect(action.kind).toBe("escalate");
  });

  it("escalates when the review never finished", () => {
    expect(decideReview(status({ nextAction: "wait" }), true).kind).toBe("escalate");
  });
});

describe("parseCryskStatus", () => {
  it("reads the fields the dispatcher uses from the real JSON shape", () => {
    const raw = {
      schema: "pr-hero.status/v1",
      next_action: "triage",
      unresolved_blocking: 1,
      findings: [
        { id: "R001", severity: "CRITICAL", tier: "blocking", blocking: true, needs_reply: true },
        { id: "R002", severity: "WARNING", tier: "advisory", blocking: false, needs_reply: true },
      ],
    };
    expect(parseCryskStatus(raw)).toEqual({
      nextAction: "triage",
      unresolvedBlocking: 1,
      findings: [critical, minor],
    });
  });

  it("rejects output without next_action", () => {
    expect(() => parseCryskStatus({ findings: [] })).toThrow(/next_action/);
  });
});

describe("prNumberFromUrl", () => {
  it.each([
    ["https://github.com/MateoLardiez/cars-webscrapper/pull/3", 3],
    ["https://github.com/o/r/pull/42/files", 42],
    ["https://github.com/o/r/issues/3", null],
  ])("%s -> %s", (url, expected) => {
    expect(prNumberFromUrl(url)).toBe(expected);
  });
});
