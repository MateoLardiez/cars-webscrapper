import { describe, expect, it } from "vitest";
import { parseSearchRequest } from "../src/services/search/request.js";

describe("parseSearchRequest", () => {
  it("fills every missing filter with null or an empty list", () => {
    expect(parseSearchRequest({})).toEqual({
      ok: true,
      filters: {
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
      },
    });
  });

  it("keeps the filters of the form", () => {
    const result = parseSearchRequest({
      maxPriceUsd: 10000,
      maxKm: 100000,
      transmission: "manual",
      excludeColors: ["amarillo", "verde"],
    });
    expect(result).toMatchObject({
      ok: true,
      filters: { maxPriceUsd: 10000, maxKm: 100000, transmission: "manual", excludeColors: ["amarillo", "verde"] },
    });
  });

  it("turns brand and model into their canonical names", () => {
    const result = parseSearchRequest({ brand: "vw", model: "gol trend" });
    expect(result).toMatchObject({ ok: true, filters: { brand: "Volkswagen", model: "Gol" } });
  });

  it.each([
    ["an unknown brand", { brand: "Lada" }],
    ["a model without brand", { model: "Ka" }],
    ["a model of another brand", { brand: "Fiat", model: "Ka" }],
    ["a min above the max", { minKm: 5000, maxKm: 1000 }],
    ["a negative number", { maxKm: -1 }],
    ["a number sent as text", { maxKm: "100000" }],
    ["an unknown transmission", { transmission: "semi" }],
  ])("rejects %s", (_label, body) => {
    const result = parseSearchRequest(body);
    expect(result.ok).toBe(false);
  });

  it("rejects a body that is not an object", () => {
    expect(parseSearchRequest(null).ok).toBe(false);
    expect(parseSearchRequest("ford").ok).toBe(false);
  });
});
