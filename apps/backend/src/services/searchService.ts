import type { Response } from "express";
import type { UsageSummary } from "@cars-webscrapper/shared";
import { searchRepository } from "../repositories/searchRepository.js";
import { carRepository } from "../repositories/carRepository.js";
import { initSse, sendSseEvent } from "../lib/sse.js";
import { addUsage } from "../lib/usage.js";
import { runAgent, AgentFailureError } from "./agent/runAgent.js";
import { parseFilters } from "./search/parseFilters.js";
import { runPipeline } from "./search/pipeline.js";
import { createExtractor } from "./search/extractorClient.js";
import { createUsdConverter } from "./search/currency.js";

function extractUrl(query: string): string {
  const match = query.match(/https?:\/\/[^\s]+/);
  return match?.[0] ?? "";
}

// Code pipeline first (one small LLM call). Returns true when it finished the
// search, false when the generic agent has to take over.
async function tryPipeline(
  searchId: number,
  userQuery: string,
  sourceUrl: string,
  res: Response,
  onUsage: (usage: UsageSummary) => void
): Promise<boolean> {
  if (!sourceUrl) return false;

  const { filters, usage } = await parseFilters(userQuery);
  onUsage(usage);
  sendSseEvent(res, { type: "tool_call", name: "parse_filters", summary: JSON.stringify(filters).slice(0, 120) });
  if (filters.unsupportedCriteria !== null) {
    sendSseEvent(res, {
      type: "agent_thinking",
      text: `Criteria the filters cannot express (${filters.unsupportedCriteria}). Using the agent.`,
    });
    return false;
  }

  const converter = createUsdConverter();
  const result = await runPipeline(sourceUrl, filters, {
    extractor: createExtractor(),
    toUsd: converter.toUsd,
    usdRate: converter.usdRate,
    saveCar: async (car) => {
      const saved = await carRepository.create({ ...car, searchId });
      sendSseEvent(res, { type: "car_saved", car: saved });
    },
    emit: (event) => sendSseEvent(res, event),
  });

  if (result.kind === "done") return true;
  if (result.kind === "unsupported") {
    sendSseEvent(res, { type: "agent_thinking", text: "No extractor for this site. Using the agent." });
    return false;
  }
  // Falling back after saving cars would duplicate them
  if (result.saved > 0) throw new AgentFailureError(result.reason);
  sendSseEvent(res, {
    type: "agent_thinking",
    text: `Extractor failed (${result.reason}). Falling back to the agent.`,
  });
  return false;
}

export async function runSearch(userQuery: string, res: Response) {
  initSse(res);

  const sourceUrl = extractUrl(userQuery);
  const search = await searchRepository.create(userQuery, sourceUrl);
  const startedAt = Date.now();
  // Holder object: a closure assignment to a plain `let` would be narrowed to null by TS
  const run: { usage: UsageSummary | null } = { usage: null };
  const onUsage = (usage: UsageSummary) => {
    run.usage = addUsage(run.usage, usage);
  };

  try {
    const finished = await tryPipeline(search.id, userQuery, sourceUrl, res, onUsage);
    if (!finished) await runAgent(search.id, userQuery, res, onUsage);

    const durationMs = Date.now() - startedAt;
    await searchRepository.markDone(search.id, durationMs, run.usage);
    const updated = await searchRepository.findById(search.id);
    sendSseEvent(res, {
      type: "done",
      carsFound: updated?.carsFound ?? 0,
      durationMs,
      usage: run.usage,
    });
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    const reason = err instanceof Error ? err.message : "Unknown error";
    await searchRepository.markFailed(search.id, reason, durationMs, run.usage);
    sendSseEvent(res, { type: "extraction_failed", reason });
  } finally {
    res.end();
  }
}
