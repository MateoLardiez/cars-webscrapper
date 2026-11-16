import type { Response } from "express";
import type { SearchFilters, UsageSummary } from "@cars-webscrapper/shared";
import { searchRepository } from "../repositories/searchRepository.js";
import { carRepository } from "../repositories/carRepository.js";
import { initSse, sendSseEvent } from "../lib/sse.js";
import { createExtractor } from "./search/extractorClient.js";
import { createUsdConverter } from "./search/currency.js";
import { describeFilters } from "./search/describe.js";
import { searchSites, summarizeOutcomes } from "./search/searchSites.js";

// Searches read the sites with code only: no LLM call, so no tokens and no cost
const NO_USAGE: UsageSummary = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
  costUsd: 0,
};

export async function runSearch(filters: SearchFilters, res: Response) {
  initSse(res);

  // No source URL: the search runs on every site with an adapter
  const search = await searchRepository.create(describeFilters(filters), "");
  const startedAt = Date.now();

  try {
    const converter = createUsdConverter();
    const outcomes = await searchSites(filters, {
      extractor: createExtractor(),
      toUsd: converter.toUsd,
      usdRate: converter.usdRate,
      saveCar: async (car) => {
        const saved = await carRepository.create({ ...car, searchId: search.id });
        sendSseEvent(res, { type: "car_saved", car: saved });
      },
      emit: (event) => sendSseEvent(res, event),
    });

    const durationMs = Date.now() - startedAt;
    const { status, failureReason } = summarizeOutcomes(outcomes);
    if (status === "failed") {
      const reason = failureReason ?? "Unknown error";
      await searchRepository.markFailed(search.id, reason, durationMs, NO_USAGE);
      sendSseEvent(res, { type: "extraction_failed", reason });
      return;
    }
    await searchRepository.markDone(search.id, durationMs, NO_USAGE, failureReason);
    const updated = await searchRepository.findById(search.id);
    sendSseEvent(res, { type: "done", carsFound: updated?.carsFound ?? 0, durationMs, usage: NO_USAGE });
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    const reason = err instanceof Error ? err.message : "Unknown error";
    await searchRepository.markFailed(search.id, reason, durationMs, NO_USAGE);
    sendSseEvent(res, { type: "extraction_failed", reason });
  } finally {
    res.end();
  }
}
