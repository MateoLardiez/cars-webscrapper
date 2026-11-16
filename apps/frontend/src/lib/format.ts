import type { UsageSummary } from "@cars-webscrapper/shared";

export function formatCost(usd: number): string {
  return `$${usd.toFixed(usd < 0.1 ? 4 : 2)}`;
}

export function formatTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

export function totalTokens(
  u: Pick<UsageSummary, "inputTokens" | "outputTokens" | "cacheReadTokens" | "cacheCreationTokens">
): number {
  return u.inputTokens + u.outputTokens + u.cacheReadTokens + u.cacheCreationTokens;
}

export function formatUsage(u: UsageSummary | null): string {
  return u ? `${formatCost(u.costUsd)} · ${formatTokens(totalTokens(u))} tokens` : "";
}

// Searches made with the form have no source URL: they run on every site
export function sourceLabel(url: string): string {
  if (!url) return "Todos los sitios";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "—";
  }
}
