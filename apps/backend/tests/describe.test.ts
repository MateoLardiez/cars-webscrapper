import { describe, expect, it } from "vitest";
import { describeFilters } from "../src/services/search/describe.js";
import type { SearchFilters } from "@cars-webscrapper/shared";

const none: SearchFilters = {
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

describe("describeFilters", () => {
  it("summarizes a search in Spanish, for the history", () => {
    const text = describeFilters({
      ...none,
      brand: "Ford",
      model: "Ka",
      maxPriceUsd: 10000,
      maxKm: 100000,
      transmission: "manual",
      excludeColors: ["amarillo", "verde"],
    });
    expect(text).toBe("Ford Ka · hasta USD 10.000 · hasta 100.000 km · manual · sin amarillo, verde");
  });

  it("describes ranges", () => {
    expect(describeFilters({ ...none, minPriceUsd: 5000, maxPriceUsd: 8000, minYear: 2015, maxYear: 2018 })).toBe(
      "USD 5.000 a 8.000 · años 2015 a 2018"
    );
  });

  it("describes a search without filters", () => {
    expect(describeFilters(none)).toBe("Todos los autos");
  });
});
