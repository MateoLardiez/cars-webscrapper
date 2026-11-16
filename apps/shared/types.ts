export interface Car {
  id: number;
  searchId: number;
  name: string;
  model: string | null;
  year: number | null;
  km: number | null;
  priceOriginal: number | null;
  currencyOriginal: string | null;
  priceUsd: number | null;
  transmission: string | null;
  color: string | null;
  characteristics: string | null;
  link: string;
  /** Id of the site the car came from ("kavak"). Null for searches saved before the form existed. */
  site: string | null;
  savedAt: string;
}

/** What the user asks for in the search form. Null or an empty list means "any". */
export interface SearchFilters {
  minPriceUsd: number | null;
  maxPriceUsd: number | null;
  minKm: number | null;
  maxKm: number | null;
  minYear: number | null;
  maxYear: number | null;
  transmission: "manual" | "automatic" | null;
  includeColors: string[];
  excludeColors: string[];
  /** Canonical names from the catalog. A model needs a brand. */
  brand: string | null;
  model: string | null;
}

export interface CatalogModel {
  name: string;
  aliases: string[];
}

export interface CatalogBrand {
  name: string;
  aliases: string[];
  models: CatalogModel[];
}

export interface Catalog {
  brands: CatalogBrand[];
}

export interface UsageSummary {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  costUsd: number;
}

export interface Search {
  id: number;
  createdAt: string;
  /** What was asked: a summary of the form filters, or the free text of an old search. */
  query: string;
  /** Empty for searches made with the form (they run on every site). */
  sourceUrl: string;
  status: "running" | "done" | "failed" | "timeout";
  failureReason: string | null;
  durationMs: number | null;
  carsFound: number;
  inputTokens: number | null;
  outputTokens: number | null;
  cacheReadTokens: number | null;
  cacheCreationTokens: number | null;
  costUsd: number | null;
}

export interface SiteStatus {
  site: string;
  status: "running" | "done" | "failed";
  carsFound: number;
  /** Why the site failed. Null otherwise. */
  reason: string | null;
}

export type SseEvent =
  | { type: "agent_thinking"; text: string }
  | { type: "tool_call"; name: string; summary: string }
  | { type: "car_saved"; car: Car }
  | ({ type: "site_status" } & SiteStatus)
  | { type: "extraction_failed"; reason: string }
  | { type: "done"; carsFound: number; durationMs: number; usage: UsageSummary | null };
