import { z } from "zod";

// What Claude extracts from the user's request. Also used as the structured output schema.
export const SearchFiltersSchema = z.object({
  minPriceUsd: z.number().nullable(),
  maxPriceUsd: z.number().nullable(),
  minKm: z.number().nullable(),
  maxKm: z.number().nullable(),
  minYear: z.number().nullable(),
  maxYear: z.number().nullable(),
  transmission: z.enum(["manual", "automatic"]).nullable(),
  includeColors: z.array(z.string()),
  excludeColors: z.array(z.string()),
  // Criteria the fields above cannot express. Non-null means the code pipeline cannot honor them.
  unsupportedCriteria: z.string().nullable(),
});

export type SearchFilters = z.infer<typeof SearchFiltersSchema>;

// The fields filters look at. `priceUsd` is null when the price or its currency is unknown.
export interface ListingFacts {
  year: number | null;
  km: number | null;
  priceUsd: number | null;
  transmission: string | null;
  color: string | null;
}

type Verdict = "pass" | "fail" | "unknown";

function normalize(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

function inRange(value: number | null, min: number | null, max: number | null): Verdict {
  if (min === null && max === null) return "pass";
  if (value === null) return "unknown";
  if (min !== null && value < min) return "fail";
  if (max !== null && value > max) return "fail";
  return "pass";
}

function transmissionVerdict(value: string | null, wanted: SearchFilters["transmission"]): Verdict {
  if (wanted === null) return "pass";
  if (value === null) return "unknown";
  const text = normalize(value);
  const isAutomatic = /autom|cvt|dsg|tiptronic/.test(text);
  const isManual = text.includes("manual") || text.includes("mecanic");
  if (!isAutomatic && !isManual) return "unknown";
  return (wanted === "automatic") === isAutomatic ? "pass" : "fail";
}

function colorVerdict(value: string | null, include: string[], exclude: string[]): Verdict {
  if (include.length === 0 && exclude.length === 0) return "pass";
  if (value === null) return "unknown";
  const color = normalize(value);
  const mentions = (names: string[]) => names.some((name) => color.includes(normalize(name)));
  if (mentions(exclude)) return "fail";
  if (include.length > 0 && !mentions(include)) return "fail";
  return "pass";
}

function verdicts(facts: ListingFacts, filters: SearchFilters): Verdict[] {
  return [
    inRange(facts.priceUsd, filters.minPriceUsd, filters.maxPriceUsd),
    inRange(facts.km, filters.minKm, filters.maxKm),
    inRange(facts.year, filters.minYear, filters.maxYear),
    transmissionVerdict(facts.transmission, filters.transmission),
    colorVerdict(facts.color, filters.includeColors, filters.excludeColors),
  ];
}

// Result cards show partial data: keep a card unless a known field fails.
export function isCandidate(facts: ListingFacts, filters: SearchFilters): boolean {
  return !verdicts(facts, filters).includes("fail");
}

// Full listing: every filtered field must be known and pass. Better to skip than guess.
export function matchesFilters(facts: ListingFacts, filters: SearchFilters): boolean {
  return verdicts(facts, filters).every((verdict) => verdict === "pass");
}
