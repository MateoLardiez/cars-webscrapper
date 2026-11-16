import { describe, expect, it } from "vitest";
import type { SseEvent } from "@cars-webscrapper/shared";
import type {
  DetailsResult,
  Extractor,
  ListingCard,
  ListingDetails,
  ListResult,
} from "../src/services/search/extractorClient.js";
import type { SearchFilters } from "../src/services/search/filters.js";
import { runPipeline, type NewCar } from "../src/services/search/pipeline.js";

const BASE = "https://www.kavak.com/ar/venta";
const ARS_PER_USD = 1000;

const filters: SearchFilters = {
  minPriceUsd: null,
  maxPriceUsd: 10000,
  minKm: null,
  maxKm: 100000,
  minYear: null,
  maxYear: null,
  transmission: "manual",
  includeColors: [],
  excludeColors: ["verde"],
  unsupportedCriteria: null,
};

function card(id: number, overrides: Partial<ListingCard> = {}): ListingCard {
  return {
    name: `Car ${id}`,
    link: `${BASE}/${id}`,
    year: 2018,
    km: 50000,
    transmission: "Manual",
    price: 9_000_000,
    currency: "ARS",
    ...overrides,
  };
}

function listing(id: number, overrides: Partial<ListingDetails> = {}): ListingDetails {
  return {
    name: `Car ${id}`,
    model: "Model",
    year: 2018,
    km: 50000,
    price_original: 9_000_000,
    currency_original: "ARS",
    transmission: "Manual",
    color: "Gris",
    characteristics: null,
    link: `${BASE}/${id}`,
    ...overrides,
  };
}

interface FakeSite {
  pages: Record<string, ListResult>;
  listings: Record<string, ListingDetails>;
}

function setup(site: FakeSite) {
  const detailCalls: string[][] = [];
  const saved: NewCar[] = [];
  const events: SseEvent[] = [];
  const extractor: Extractor = {
    async list(url) {
      return site.pages[url] ?? { supported: true, error: `no page ${url}` };
    },
    async details(urls): Promise<DetailsResult> {
      detailCalls.push(urls);
      return {
        supported: true,
        results: urls.map((url) => {
          const found = site.listings[url];
          return found ? { url, listing: found } : { url, error: "RuntimeError: HTTP 404" };
        }),
      };
    },
  };
  const deps = {
    extractor,
    toUsd: async (amount: number, currency: string) => (currency === "ARS" ? amount / ARS_PER_USD : amount),
    saveCar: async (car: NewCar) => {
      saved.push(car);
    },
    emit: (event: SseEvent) => {
      events.push(event);
    },
  };
  return { deps, detailCalls, saved, events };
}

function page(cards: ListingCard[], next: string | null = null): ListResult {
  return { supported: true, url_used: "x", listings: cards, next_page_url: next };
}

describe("runPipeline", () => {
  it("reports unsupported sites so the agent can take over", async () => {
    const { deps } = setup({ pages: { start: { supported: false, error: "No adapter" } }, listings: {} });
    expect(await runPipeline("start", filters, deps)).toEqual({ kind: "unsupported" });
  });

  it("opens only the cards that pass the pre-filter and saves the matches", async () => {
    const cards = [
      card(1),
      card(2, { km: 150000 }), // fails on the card: never opened
      card(3, { price: 20_000_000 }), // USD 20.000 on the card: never opened
      card(4), // passes the card, but the details show it is green
      card(5, { transmission: null }), // unknown on the card: opened, manual in the details
    ];
    const { deps, detailCalls, saved } = setup({
      pages: { start: page(cards) },
      listings: {
        [`${BASE}/1`]: listing(1),
        [`${BASE}/4`]: listing(4, { color: "Verde" }),
        [`${BASE}/5`]: listing(5),
      },
    });

    const result = await runPipeline("start", filters, deps);

    expect(result).toEqual({ kind: "done", saved: 2 });
    expect(detailCalls).toEqual([[`${BASE}/1`, `${BASE}/4`, `${BASE}/5`]]);
    expect(saved.map((car) => car.link)).toEqual([`${BASE}/1`, `${BASE}/5`]);
    expect(saved[0]).toMatchObject({ priceOriginal: 9_000_000, currencyOriginal: "ARS", priceUsd: 9000 });
  });

  it("requests details in batches of 10", async () => {
    const cards = Array.from({ length: 23 }, (_, i) => card(i));
    const listings = Object.fromEntries(cards.map((c, i) => [c.link, listing(i)]));
    const { deps, detailCalls, saved } = setup({ pages: { start: page(cards) }, listings });

    await runPipeline("start", filters, deps);

    expect(detailCalls.map((batch) => batch.length)).toEqual([10, 10, 3]);
    expect(saved).toHaveLength(23);
  });

  it("follows next pages up to 3 and skips cards already seen", async () => {
    const { deps, saved } = setup({
      pages: {
        p1: page([card(1)], "p2"),
        p2: page([card(1), card(2)], "p3"),
        p3: page([card(3)], "p4"),
        p4: page([card(4)]),
      },
      listings: {
        [`${BASE}/1`]: listing(1),
        [`${BASE}/2`]: listing(2),
        [`${BASE}/3`]: listing(3),
        [`${BASE}/4`]: listing(4),
      },
    });

    expect(await runPipeline("p1", filters, deps)).toEqual({ kind: "done", saved: 3 });
    expect(saved.map((car) => car.link)).toEqual([`${BASE}/1`, `${BASE}/2`, `${BASE}/3`]);
  });

  it("saves a canonical listing once when two cards point to it", async () => {
    const canonical = listing(1);
    const { deps, saved } = setup({
      pages: { start: page([card(1), card(2)]) },
      listings: { [`${BASE}/1`]: canonical, [`${BASE}/2`]: canonical },
    });

    expect(await runPipeline("start", filters, deps)).toEqual({ kind: "done", saved: 1 });
    expect(saved).toHaveLength(1);
  });

  it("skips listings that no longer exist", async () => {
    const { deps, saved } = setup({
      pages: { start: page([card(1), card(2)]) },
      listings: { [`${BASE}/1`]: listing(1) },
    });
    expect(await runPipeline("start", filters, deps)).toEqual({ kind: "done", saved: 1 });
    expect(saved).toHaveLength(1);
  });

  it("returns a failure with the count saved so far", async () => {
    const { deps } = setup({ pages: { p1: page([card(1)], "broken") }, listings: { [`${BASE}/1`]: listing(1) } });
    expect(await runPipeline("p1", filters, deps)).toEqual({
      kind: "failed",
      reason: "no page broken",
      saved: 1,
    });
  });

  it("turns a thrown error into a failure", async () => {
    const { deps } = setup({ pages: { start: page([card(1)]) }, listings: {} });
    deps.toUsd = async () => {
      throw new Error("Exchange rate request failed: HTTP 500");
    };
    expect(await runPipeline("start", filters, deps)).toEqual({
      kind: "failed",
      reason: "Exchange rate request failed: HTTP 500",
      saved: 0,
    });
  });
});
