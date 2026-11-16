import { describe, expect, it } from "vitest";
import { isCandidate, matchesFilters, type ListingFacts, type SearchFilters } from "../src/services/search/filters.js";

const noFilters: SearchFilters = {
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

// The example request: under USD 10.000, under 100.000 km, manual, not yellow or green
const exampleFilters: SearchFilters = {
  ...noFilters,
  maxPriceUsd: 10000,
  maxKm: 100000,
  transmission: "manual",
  excludeColors: ["amarillo", "verde"],
};

const goodCar: ListingFacts = {
  brand: "Ford",
  model: "Ka",
  year: 2018,
  km: 75000,
  priceUsd: 9500,
  transmission: "Manual",
  color: "Gris Plata",
};

describe("matchesFilters", () => {
  it("accepts a listing that meets every filter", () => {
    expect(matchesFilters(goodCar, exampleFilters)).toBe(true);
  });

  it("accepts anything when there are no filters", () => {
    const unknown = { brand: null, model: null, year: null, km: null, priceUsd: null, transmission: null, color: null };
    expect(matchesFilters(unknown, noFilters)).toBe(true);
  });

  it.each([
    ["price above the max", { priceUsd: 10001 }],
    ["km above the max", { km: 100001 }],
    ["automatic transmission", { transmission: "Automática" }],
    ["excluded color", { color: "Verde Oscuro" }],
  ])("rejects %s", (_label, change) => {
    expect(matchesFilters({ ...goodCar, ...change }, exampleFilters)).toBe(false);
  });

  it("keeps limits inclusive", () => {
    expect(matchesFilters({ ...goodCar, priceUsd: 10000, km: 100000 }, exampleFilters)).toBe(true);
  });

  it("rejects a listing whose filtered field is unknown", () => {
    expect(matchesFilters({ ...goodCar, priceUsd: null }, exampleFilters)).toBe(false);
    expect(matchesFilters({ ...goodCar, color: null }, exampleFilters)).toBe(false);
  });

  it("applies year ranges", () => {
    const filters = { ...noFilters, minYear: 2015, maxYear: 2018 };
    expect(matchesFilters({ ...goodCar, year: 2014 }, filters)).toBe(false);
    expect(matchesFilters({ ...goodCar, year: 2016 }, filters)).toBe(true);
  });

  it("matches colors ignoring case and accents, and honors include lists", () => {
    const filters = { ...noFilters, includeColors: ["gris", "blanco"] };
    expect(matchesFilters({ ...goodCar, color: "GRIS" }, filters)).toBe(true);
    expect(matchesFilters({ ...goodCar, color: "Rojo" }, filters)).toBe(false);
  });

  it.each([
    ["Manual", "manual", true],
    ["Mecánica", "manual", true],
    ["Automática", "automatic", true],
    ["CVT", "automatic", true],
    ["Manual", "automatic", false],
  ] as const)("transmission %s for %s is %s", (value, wanted, expected) => {
    const filters = { ...noFilters, transmission: wanted };
    expect(matchesFilters({ ...goodCar, transmission: value }, filters)).toBe(expected);
  });
});

describe("brand and model", () => {
  const fordKa = { ...noFilters, brand: "Ford", model: "Ka" };

  it("accepts the wanted brand and model, ignoring case and accents", () => {
    expect(matchesFilters(goodCar, fordKa)).toBe(true);
    expect(matchesFilters({ ...goodCar, brand: "FORD", model: "ka" }, fordKa)).toBe(true);
    expect(matchesFilters({ ...goodCar, brand: "Citroen" }, { ...noFilters, brand: "Citroën" })).toBe(true);
  });

  it("rejects another brand or another model", () => {
    expect(matchesFilters({ ...goodCar, brand: "Fiat" }, fordKa)).toBe(false);
    expect(matchesFilters({ ...goodCar, model: "Focus" }, fordKa)).toBe(false);
  });

  it("filters by brand alone", () => {
    const fordOnly = { ...noFilters, brand: "Ford" };
    expect(matchesFilters({ ...goodCar, model: "Focus" }, fordOnly)).toBe(true);
    expect(matchesFilters({ ...goodCar, brand: "Fiat" }, fordOnly)).toBe(false);
  });

  it("rejects a listing whose brand or model is unknown", () => {
    expect(matchesFilters({ ...goodCar, brand: null }, fordKa)).toBe(false);
    expect(matchesFilters({ ...goodCar, model: null }, fordKa)).toBe(false);
  });

  it("does not look at the model when none is wanted", () => {
    expect(matchesFilters({ ...goodCar, model: null }, { ...noFilters, brand: "Ford" })).toBe(true);
  });

  it("keeps a card with unknown brand or model, but drops a card that fails", () => {
    expect(isCandidate({ ...goodCar, brand: null, model: null }, fordKa)).toBe(true);
    expect(isCandidate({ ...goodCar, brand: "Fiat" }, fordKa)).toBe(false);
    expect(isCandidate({ ...goodCar, model: "Focus" }, fordKa)).toBe(false);
  });
});

describe("isCandidate", () => {
  it("keeps a card with missing fields, to check them in the details", () => {
    const card = { brand: null, model: null, year: null, km: null, priceUsd: null, transmission: null, color: null };
    expect(isCandidate(card, exampleFilters)).toBe(true);
  });

  it("drops a card when a known field fails", () => {
    expect(isCandidate({ ...goodCar, km: 150000, color: null }, exampleFilters)).toBe(false);
  });
});
