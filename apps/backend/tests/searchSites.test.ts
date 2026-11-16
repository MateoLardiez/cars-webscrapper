import { describe, expect, it } from "vitest";
import type { SseEvent } from "@cars-webscrapper/shared";
import type {
  DetailsResult,
  Extractor,
  ListingCard,
  ListingDetails,
  ListResult,
  SiteEntry,
} from "../src/services/search/extractorClient.js";
import type { SearchFilters } from "@cars-webscrapper/shared";
import { searchSites, summarizeOutcomes, type SavedCar, type SiteOutcome } from "../src/services/search/searchSites.js";

const filters: SearchFilters = {
  minPriceUsd: null,
  maxPriceUsd: null,
  minKm: null,
  maxKm: null,
  minYear: null,
  maxYear: null,
  transmission: null,
  includeColors: [],
  excludeColors: [],
  brand: null,
  model: null,
};

const SITES: SiteEntry[] = [
  { id: "alpha", start_url: "https://alpha.test/start", currency: "USD" },
  { id: "beta", start_url: "https://beta.test/start", currency: "USD" },
];

function card(host: string, id: number): ListingCard {
  return {
    name: `Car ${id}`,
    brand: "Ford",
    model: "Ka",
    link: `https://${host}/car/${id}`,
    year: 2018,
    km: 1000,
    transmission: "Manual",
    price: 5000,
    currency: "USD",
  };
}

function listing(host: string, id: number): ListingDetails {
  return {
    name: `Car ${id}`,
    brand: "Ford",
    model: "Ka",
    year: 2018,
    km: 1000,
    price_original: 5000,
    currency_original: "USD",
    transmission: "Manual",
    color: "Gris",
    characteristics: null,
    link: `https://${host}/car/${id}`,
  };
}

interface Options {
  sites?: SiteEntry[];
  // hosts whose requests throw
  broken?: string[];
  // hosts that answer with a list error
  failingList?: string[];
}

function setup(options: Options = {}) {
  const saved: SavedCar[] = [];
  const events: SseEvent[] = [];
  const host = (url: string) => new URL(url).host;
  let running = 0;
  let maxRunning = 0;

  const extractor: Extractor = {
    async sites() {
      return { sites: options.sites ?? SITES };
    },
    async site(url) {
      if (options.broken?.includes(host(url))) throw new Error("spawn python ENOENT");
      return { supported: true, currency: "USD" };
    },
    async list(url): Promise<ListResult> {
      running += 1;
      maxRunning = Math.max(maxRunning, running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running -= 1;
      if (options.failingList?.includes(host(url))) return { supported: true, error: "HTTP 500" };
      return { supported: true, url_used: url, listings: [card(host(url), 1), card(host(url), 2)], next_page_url: null };
    },
    async details(urls): Promise<DetailsResult> {
      return {
        supported: true,
        results: urls.map((url) => ({ url, listing: listing(host(url), Number(url.split("/").pop())) })),
      };
    },
  };

  const deps = {
    extractor,
    toUsd: async (amount: number) => amount,
    usdRate: async () => 1,
    saveCar: async (car: SavedCar) => {
      saved.push(car);
    },
    emit: (event: SseEvent) => {
      events.push(event);
    },
  };
  return { deps, saved, events, maxRunning: () => maxRunning };
}

const statusEvents = (events: SseEvent[]) =>
  events.filter((e): e is Extract<SseEvent, { type: "site_status" }> => e.type === "site_status");

describe("searchSites", () => {
  it("searches every site and saves each car with its site", async () => {
    const { deps, saved } = setup();

    const outcomes = await searchSites(filters, deps);

    expect(outcomes).toEqual([
      { site: "alpha", status: "done", carsFound: 2, reason: null },
      { site: "beta", status: "done", carsFound: 2, reason: null },
    ]);
    expect(saved.map((car) => [car.site, car.link]).sort()).toEqual([
      ["alpha", "https://alpha.test/car/1"],
      ["alpha", "https://alpha.test/car/2"],
      ["beta", "https://beta.test/car/1"],
      ["beta", "https://beta.test/car/2"],
    ]);
  });

  it("keeps the results of the other sites when one site fails", async () => {
    const { deps, saved, events } = setup({ broken: ["alpha.test"] });

    const outcomes = await searchSites(filters, deps);

    expect(outcomes).toEqual([
      { site: "alpha", status: "failed", carsFound: 0, reason: "spawn python ENOENT" },
      { site: "beta", status: "done", carsFound: 2, reason: null },
    ]);
    expect(saved.every((car) => car.site === "beta")).toBe(true);
    expect(saved).toHaveLength(2);
    expect(statusEvents(events)).toContainEqual({
      type: "site_status",
      site: "alpha",
      status: "failed",
      carsFound: 0,
      reason: "spawn python ENOENT",
    });
  });

  it("reports a site that answers with an error, as failed", async () => {
    const { deps } = setup({ failingList: ["beta.test"] });
    const outcomes = await searchSites(filters, deps);
    expect(outcomes[1]).toEqual({ site: "beta", status: "failed", carsFound: 0, reason: "HTTP 500" });
  });

  it("emits a running and a final status for every site", async () => {
    const { deps, events } = setup();
    await searchSites(filters, deps);
    const statuses = statusEvents(events).map((e) => `${e.site}:${e.status}`);
    expect(statuses).toEqual(expect.arrayContaining(["alpha:running", "beta:running", "alpha:done", "beta:done"]));
  });

  it("starts each site from its own URL and tags the activity with the site", async () => {
    const { deps, events } = setup();
    await searchSites(filters, deps);
    const calls = events.filter((e) => e.type === "tool_call" && e.name === "list_listings");
    expect(calls.map((e) => (e.type === "tool_call" ? e.summary : ""))).toEqual(
      expect.arrayContaining([expect.stringContaining("alpha.test/start"), expect.stringContaining("beta.test/start")])
    );
    expect(events.some((e) => e.type === "agent_thinking" && e.text.startsWith("[alpha]"))).toBe(true);
  });

  it("runs the sites in parallel, but no more than the limit at once", async () => {
    const many = Array.from({ length: 8 }, (_, i) => ({
      id: `s${i}`,
      start_url: `https://s${i}.test/start`,
      currency: "USD",
    }));
    const { deps, maxRunning } = setup({ sites: many });
    await searchSites(filters, deps);
    expect(maxRunning()).toBeGreaterThan(1);
    expect(maxRunning()).toBeLessThanOrEqual(3);
  });

  it("throws when the list of sites cannot be read", async () => {
    const { deps } = setup();
    deps.extractor.sites = async () => {
      throw new Error("cars_cli crashed");
    };
    await expect(searchSites(filters, deps)).rejects.toThrow("cars_cli crashed");
  });

  it("keeps the cars a site saved before it failed", async () => {
    const { deps, saved } = setup();
    const original = deps.extractor.details;
    deps.extractor.details = async (urls) => {
      const first = urls[0] ?? "";
      if (first.includes("beta.test")) return { supported: true, error: "browser crashed" };
      return original(urls);
    };
    const outcomes = await searchSites(filters, deps);
    expect(outcomes[1]).toMatchObject({ site: "beta", status: "failed", reason: "browser crashed" });
    expect(saved.filter((car) => car.site === "alpha")).toHaveLength(2);
  });
});

describe("summarizeOutcomes", () => {
  const done = (site: string, carsFound: number): SiteOutcome => ({ site, status: "done", carsFound, reason: null });
  const failed = (site: string, reason: string, carsFound = 0): SiteOutcome => ({
    site,
    status: "failed",
    carsFound,
    reason,
  });

  it("is done without a failure reason when every site worked", () => {
    expect(summarizeOutcomes([done("a", 2), done("b", 0)])).toEqual({ status: "done", failureReason: null });
  });

  it("is done, with the failed sites listed, when at least one site worked", () => {
    expect(summarizeOutcomes([failed("a", "HTTP 500"), done("b", 3)])).toEqual({
      status: "done",
      failureReason: "a: HTTP 500",
    });
  });

  it("is failed when every site failed and nothing was saved", () => {
    expect(summarizeOutcomes([failed("a", "HTTP 500"), failed("b", "timeout")])).toEqual({
      status: "failed",
      failureReason: "a: HTTP 500; b: timeout",
    });
  });

  it("is done when every site failed but some cars were saved first", () => {
    expect(summarizeOutcomes([failed("a", "HTTP 500", 4)]).status).toBe("done");
  });

  it("is failed when there are no sites to search", () => {
    expect(summarizeOutcomes([])).toEqual({ status: "failed", failureReason: "No sites available" });
  });
});
