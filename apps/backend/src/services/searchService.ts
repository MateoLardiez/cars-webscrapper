import type { Response } from "express";
import { searchRepository } from "../repositories/searchRepository.js";
import { initSse, sendSseEvent } from "../lib/sse.js";
import { runAgent, AgentFailureError } from "./agent/runAgent.js";

function extractUrl(query: string): string {
  const match = query.match(/https?:\/\/[^\s]+/);
  return match?.[0] ?? "";
}

export async function runSearch(userQuery: string, res: Response) {
  initSse(res);

  const sourceUrl = extractUrl(userQuery);
  const search = await searchRepository.create(userQuery, sourceUrl);
  const startedAt = Date.now();

  try {
    await runAgent(search.id, userQuery, res);

    const durationMs = Date.now() - startedAt;
    await searchRepository.markDone(search.id, durationMs);
    const updated = await searchRepository.findById(search.id);
    sendSseEvent(res, {
      type: "done",
      carsFound: updated?.carsFound ?? 0,
      durationMs,
    });
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    const reason = err instanceof Error ? err.message : "Unknown error";
    if (err instanceof AgentFailureError) {
      await searchRepository.markFailed(search.id, reason, durationMs);
      sendSseEvent(res, { type: "extraction_failed", reason });
    } else {
      await searchRepository.markFailed(search.id, reason, durationMs);
      sendSseEvent(res, { type: "extraction_failed", reason });
    }
  } finally {
    res.end();
  }
}
