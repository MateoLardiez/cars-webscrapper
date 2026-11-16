import { describe, expect, it } from "vitest";
import { EMPTY_FORM, formError, formToFilters } from "./searchForm";

describe("formToFilters", () => {
  it("turns an empty form into filters that accept anything", () => {
    expect(formToFilters(EMPTY_FORM)).toEqual({
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
    });
  });

  it("turns the text of the inputs into numbers", () => {
    const filters = formToFilters({ ...EMPTY_FORM, maxPrice: "10000", maxKm: "100000", minYear: "2015" });
    expect(filters).toMatchObject({ maxPriceUsd: 10000, maxKm: 100000, minYear: 2015, minKm: null });
  });

  it("ignores text that is not a number", () => {
    expect(formToFilters({ ...EMPTY_FORM, maxPrice: "abc" }).maxPriceUsd).toBeNull();
  });

  it("maps the transmission select", () => {
    expect(formToFilters({ ...EMPTY_FORM, transmission: "manual" }).transmission).toBe("manual");
    expect(formToFilters({ ...EMPTY_FORM, transmission: "automatic" }).transmission).toBe("automatic");
    expect(formToFilters({ ...EMPTY_FORM, transmission: "any" }).transmission).toBeNull();
  });

  it("keeps brand, model and colors", () => {
    const filters = formToFilters({
      ...EMPTY_FORM,
      brand: "Ford",
      model: "Ka",
      includeColors: ["gris"],
      excludeColors: ["verde", "amarillo"],
    });
    expect(filters).toMatchObject({ brand: "Ford", model: "Ka", includeColors: ["gris"], excludeColors: ["verde", "amarillo"] });
  });

  it("drops the model when there is no brand", () => {
    expect(formToFilters({ ...EMPTY_FORM, model: "Ka" }).model).toBeNull();
  });
});

describe("formError", () => {
  it("accepts an empty form and valid ranges", () => {
    expect(formError(EMPTY_FORM)).toBeNull();
    expect(formError({ ...EMPTY_FORM, minKm: "1000", maxKm: "1000" })).toBeNull();
  });

  it.each([
    ["maxPrice", "minPrice", "Precio"],
    ["maxKm", "minKm", "Kilometraje"],
    ["maxYear", "minYear", "Año"],
  ] as const)("rejects a minimum above the maximum (%s)", (max, min, label) => {
    expect(formError({ ...EMPTY_FORM, [min]: "5000", [max]: "1000" })).toContain(label);
  });

  it("rejects a negative number", () => {
    expect(formError({ ...EMPTY_FORM, maxKm: "-5" })).toContain("Kilometraje");
  });
});
