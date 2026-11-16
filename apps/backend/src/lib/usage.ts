import type { UsageSummary } from "@cars-webscrapper/shared";

export function addUsage(total: UsageSummary | null, usage: UsageSummary): UsageSummary {
  if (total === null) return { ...usage };
  return {
    inputTokens: total.inputTokens + usage.inputTokens,
    outputTokens: total.outputTokens + usage.outputTokens,
    cacheReadTokens: total.cacheReadTokens + usage.cacheReadTokens,
    cacheCreationTokens: total.cacheCreationTokens + usage.cacheCreationTokens,
    costUsd: total.costUsd + usage.costUsd,
  };
}
