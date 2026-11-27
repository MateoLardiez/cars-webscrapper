/**
 * Pure decisions about an agent's pull request, from `crysk status --pr <n> --json`.
 * No I/O here, so the rules are easy to test.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export interface CryskFinding {
  id: string;
  severity: string; // BLOCKER, CRITICAL, WARNING or SUGGESTION
  blocking: boolean;
  needsReply: boolean;
}

export interface CryskStatus {
  /** wait, review, triage, fix, recheck, override-or-fix or done. */
  nextAction: string;
  unresolvedBlocking: number;
  findings: CryskFinding[];
}

export function parseCryskStatus(raw: unknown): CryskStatus {
  if (!isRecord(raw) || typeof raw.next_action !== "string") {
    throw new Error("Unexpected crysk status: missing next_action");
  }
  const findings = Array.isArray(raw.findings) ? raw.findings : [];
  return {
    nextAction: raw.next_action,
    unresolvedBlocking: typeof raw.unresolved_blocking === "number" ? raw.unresolved_blocking : 0,
    findings: findings.flatMap((finding: unknown) =>
      isRecord(finding) && typeof finding.id === "string"
        ? [
            {
              id: finding.id,
              severity: typeof finding.severity === "string" ? finding.severity : "UNKNOWN",
              blocking: finding.blocking === true,
              needsReply: finding.needs_reply === true,
            },
          ]
        : [],
    ),
  };
}

export type ReviewAction =
  | { kind: "wait" }
  | { kind: "fix" }
  | { kind: "merge"; openSuggestions: string[] }
  | { kind: "escalate"; reason: string };

/**
 * What to do with a pull request given its Crysk status.
 *
 * - A review still running: wait (or escalate if the agent already finished its loop).
 * - No unresolved blocking finding and the loop is closed (`done`), or the agent already ran its
 *   loop: merge. Minor findings left unanswered never block; they are reported.
 * - Unresolved findings before the agent ran: send the agent to fix them.
 * - Blocking findings left after the agent ran: escalate to a human.
 */
export function decideReview(status: CryskStatus, agentAlreadyRan: boolean): ReviewAction {
  if (status.nextAction === "wait") {
    return agentAlreadyRan
      ? { kind: "escalate", reason: "la revisión de Crysk no terminó a tiempo" }
      : { kind: "wait" };
  }
  if (status.unresolvedBlocking === 0 && (status.nextAction === "done" || agentAlreadyRan)) {
    const openSuggestions = status.findings
      .filter((finding) => !finding.blocking && finding.needsReply)
      .map((finding) => `${finding.id} (${finding.severity})`);
    return { kind: "merge", openSuggestions };
  }
  if (!agentAlreadyRan) return { kind: "fix" };
  return {
    kind: "escalate",
    reason:
      `Crysk sigue con ${status.unresolvedBlocking} hallazgo(s) bloqueante(s) sin resolver ` +
      `después del loop del agente (next_action: ${status.nextAction})`,
  };
}

/** "https://github.com/owner/repo/pull/3" -> 3. */
export function prNumberFromUrl(url: string): number | null {
  const match = /\/pull\/(\d+)(?:[/?#]|$)/.exec(url);
  return match?.[1] ? Number(match[1]) : null;
}
