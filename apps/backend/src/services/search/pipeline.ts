import type { SseEvent } from "@cars-webscrapper/shared";
import type { CreateCarInput } from "../../repositories/carRepository.js";
import type { ToUsd, UsdRate } from "./currency.js";
import type { Extractor, ListingDetails, SiteFilters } from "./extractorClient.js";
import { isCandidate, matchesFilters, type SearchFilters } from "./filters.js";

// Safety cap for sites that cannot filter in the URL. Reading pages costs no LLM tokens.
export const MAX_PAGES = 50;
export const DETAILS_BATCH = 10;

export type NewCar = Omit<CreateCarInput, "searchId">;

export interface PipelineDeps {
  extractor: Extractor;
  toUsd: ToUsd;
  usdRate: UsdRate;
  saveCar: (car: NewCar) => Promise<void>;
  emit: (event: SseEvent) => void;
}

export type PipelineResult =
  | { kind: "unsupported" }
  | { kind: "done"; saved: number }
  | { kind: "failed"; reason: string; saved: number };

async function priceInUsd(
  amount: number | null,
  currency: string | null,
  toUsd: ToUsd
): Promise<number | null> {
  if (amount === null || currency === null) return null;
  return toUsd(amount, currency);
}

async function saveIfMatches(
  listing: ListingDetails,
  filters: SearchFilters,
  deps: PipelineDeps
): Promise<boolean> {
  const priceUsd = await priceInUsd(listing.price_original, listing.currency_original, deps.toUsd);
  const facts = { ...listing, priceUsd };
  if (!matchesFilters(facts, filters)) return false;
  await deps.saveCar({
    name: listing.name ?? listing.model ?? "Unknown",
    model: listing.model,
    year: listing.year,
    km: listing.km,
    priceOriginal: listing.price_original,
    currencyOriginal: listing.currency_original,
    priceUsd,
    transmission: listing.transmission,
    color: listing.color,
    characteristics: listing.characteristics,
    link: listing.link,
  });
  return true;
}

// The search filters in the site's currency. Min rounds down and max rounds up,
// so the site never drops a listing the code filter would accept.
export async function toSiteFilters(
  filters: SearchFilters,
  currency: string | null,
  usdRate: UsdRate
): Promise<SiteFilters> {
  const rate = currency === null ? null : await usdRate(currency);
  const local = (usd: number | null, round: (n: number) => number) =>
    usd === null || rate === null ? null : round(usd / rate);
  return {
    min_km: filters.minKm,
    max_km: filters.maxKm,
    min_price: local(filters.minPriceUsd, Math.floor),
    max_price: local(filters.maxPriceUsd, Math.ceil),
    transmission: filters.transmission,
  };
}

// Deterministic search: list results, pre-filter the cards, open the
// candidates and save the ones that match. No LLM involved.
export async function runPipeline(
  url: string,
  filters: SearchFilters,
  deps: PipelineDeps
): Promise<PipelineResult> {
  const seen = new Set<string>(); // card links already considered
  const savedLinks = new Set<string>();
  let saved = 0;
  let pageUrl: string | null = url;

  try {
    const site = await deps.extractor.site(url);
    if (!site.supported) return { kind: "unsupported" };
    const siteFilters = await toSiteFilters(filters, site.currency, deps.usdRate);

    for (let page = 1; page <= MAX_PAGES && pageUrl !== null; page++) {
      deps.emit({ type: "tool_call", name: "list_listings", summary: pageUrl });
      const list = await deps.extractor.list(pageUrl, siteFilters);
      if (!list.supported) return { kind: "unsupported" };
      if ("error" in list) return { kind: "failed", reason: list.error, saved };

      const candidates: string[] = [];
      for (const card of list.listings) {
        if (seen.has(card.link)) continue;
        seen.add(card.link);
        const priceUsd = await priceInUsd(card.price, card.currency, deps.toUsd);
        if (isCandidate({ ...card, priceUsd, color: null }, filters)) candidates.push(card.link);
      }
      deps.emit({
        type: "agent_thinking",
        text: `Page ${page}: ${list.listings.length} listings, ${candidates.length} candidates.`,
      });

      for (let i = 0; i < candidates.length; i += DETAILS_BATCH) {
        const batch = candidates.slice(i, i + DETAILS_BATCH);
        deps.emit({ type: "tool_call", name: "get_listing_details", summary: `${batch.length} listings` });
        const details = await deps.extractor.details(batch);
        if (!details.supported) return { kind: "unsupported" };
        if ("error" in details) return { kind: "failed", reason: details.error, saved };

        for (const result of details.results) {
          // A listing that no longer exists is skipped, not a failure of the search
          if (!("listing" in result)) continue;
          // Two cards can point to the same canonical listing: save it once
          if (savedLinks.has(result.listing.link)) continue;
          if (await saveIfMatches(result.listing, filters, deps)) {
            savedLinks.add(result.listing.link);
            saved += 1;
          }
        }
      }
      pageUrl = list.next_page_url;
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Unknown error";
    return { kind: "failed", reason, saved };
  }
  return { kind: "done", saved };
}
