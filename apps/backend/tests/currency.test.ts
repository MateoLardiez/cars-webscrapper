import { describe, expect, it } from "vitest";
import { createUsdConverter } from "../src/services/search/currency.js";

function fakeFetch(responses: Response[]) {
  const urls: string[] = [];
  const fn: typeof fetch = async (input) => {
    urls.push(String(input));
    const next = responses.shift();
    if (!next) throw new Error("unexpected request");
    return next;
  };
  return { fn, urls };
}

const rates = (usd: number) => Response.json({ rates: { USD: usd } });

describe("createUsdConverter", () => {
  it("returns USD amounts without a request", async () => {
    const { fn, urls } = fakeFetch([]);
    expect(await createUsdConverter(fn).toUsd(500, "usd")).toBe(500);
    expect(urls).toEqual([]);
  });

  it("converts and rounds to cents", async () => {
    const { fn } = fakeFetch([rates(0.000823)]);
    expect(await createUsdConverter(fn).toUsd(12_140_000, "ARS")).toBe(9991.22);
  });

  it("fetches each currency rate once, even for concurrent calls", async () => {
    const { fn, urls } = fakeFetch([rates(0.001)]);
    const { toUsd } = createUsdConverter(fn);
    const results = await Promise.all([toUsd(1000, "ARS"), toUsd(2000, "ars")]);
    expect(results).toEqual([1, 2]);
    expect(urls).toEqual(["https://api.exchangerate-api.com/v4/latest/ARS"]);
  });

  it("does not cache a failed request", async () => {
    const { fn, urls } = fakeFetch([new Response("", { status: 500 }), rates(0.001)]);
    const { toUsd } = createUsdConverter(fn);
    await expect(toUsd(1000, "ARS")).rejects.toThrow("HTTP 500");
    expect(await toUsd(1000, "ARS")).toBe(1);
    expect(urls).toHaveLength(2);
  });

  it("exposes the raw rate", async () => {
    const { fn } = fakeFetch([rates(0.000646)]);
    const { usdRate } = createUsdConverter(fn);
    expect(await usdRate("ARS")).toBe(0.000646);
    expect(await usdRate("USD")).toBe(1);
  });
});
