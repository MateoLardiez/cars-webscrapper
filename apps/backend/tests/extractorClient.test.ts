import { describe, expect, it } from "vitest";
import { createExtractor } from "../src/services/search/extractorClient.js";

function cliReturning(output: unknown) {
  const calls: string[][] = [];
  const extractor = createExtractor(async (args) => {
    calls.push(args);
    return JSON.stringify(output);
  });
  return { extractor, calls };
}

describe("createExtractor", () => {
  it("passes the list and details commands to the CLI", async () => {
    const { extractor, calls } = cliReturning({ supported: false, error: "No adapter for this site." });
    await extractor.site("https://a.com");
    await extractor.list("https://a.com");
    await extractor.list("https://a.com", {
      min_km: null,
      max_km: 100000,
      min_price: null,
      max_price: null,
      transmission: "manual",
      brand: null,
      model: null,
    });
    await extractor.details(["https://a.com/1", "https://a.com/2"]);
    expect(calls).toEqual([
      ["site", "https://a.com"],
      ["list", "https://a.com"],
      [
        "list",
        "https://a.com",
        '{"min_km":null,"max_km":100000,"min_price":null,"max_price":null,"transmission":"manual","brand":null,"model":null}',
      ],
      ["details", "https://a.com/1", "https://a.com/2"],
    ]);
  });

  it("parses a results page", async () => {
    const page = {
      supported: true,
      url_used: "https://www.kavak.com/ar/usados",
      listings: [
        {
          name: "Ford Ka",
          brand: "Ford",
          model: "Ka",
          link: "https://www.kavak.com/ar/venta/1",
          year: 2018,
          km: 75368,
          transmission: "Manual",
          price: 12140000,
          currency: "ARS",
        },
      ],
      next_page_url: null,
    };
    const { extractor } = cliReturning(page);
    expect(await extractor.list("https://www.kavak.com/ar")).toEqual(page);
  });

  it("parses details with a failing listing in the batch", async () => {
    const result = {
      supported: true,
      results: [{ url: "https://a.com/1", error: "ValueError: Listing not available" }],
    };
    const { extractor } = cliReturning(result);
    expect(await extractor.details(["https://a.com/1"])).toEqual(result);
  });

  it("lists the sites a search runs on", async () => {
    const sites = { sites: [{ id: "kavak", start_url: "https://www.kavak.com/ar/usados", currency: "ARS" }] };
    const { extractor, calls } = cliReturning(sites);
    expect(await extractor.sites()).toEqual(sites);
    expect(calls).toEqual([["sites"]]);
  });

  it("rejects output with an unexpected shape", async () => {
    const { extractor } = cliReturning({ supported: true, listings: "not a list" });
    await expect(extractor.list("https://a.com")).rejects.toThrow();
  });
});
