import { describe, expect, it } from "vitest";
import { canonicalBrand, canonicalModel, getCatalog } from "../src/services/search/catalog.js";

describe("catalog", () => {
  it("lists brands with their models", () => {
    const catalog = getCatalog();
    const volkswagen = catalog.brands.find((brand) => brand.name === "Volkswagen");
    expect(volkswagen?.models.map((model) => model.name)).toContain("Gol");
  });

  it.each([
    ["Volkswagen", "Volkswagen"],
    ["VW", "Volkswagen"],
    ["  vw ", "Volkswagen"],
    ["citroen", "Citroën"],
  ])("resolves brand %s to %s", (raw, expected) => {
    expect(canonicalBrand(raw)).toBe(expected);
  });

  it("returns null for a brand outside the catalog", () => {
    expect(canonicalBrand("Lada")).toBeNull();
    expect(canonicalBrand("")).toBeNull();
  });

  it("resolves a model under its brand, including variants of it", () => {
    expect(canonicalModel("Volkswagen", "gol")).toBe("Gol");
    expect(canonicalModel("Volkswagen", "Gol Trend")).toBe("Gol");
    expect(canonicalModel("Ford", "ecosport")).toBe("EcoSport");
  });

  it("does not take another model that merely starts the same way", () => {
    expect(canonicalModel("Volkswagen", "Golf")).toBeNull();
  });

  it("returns null for a model the brand does not have", () => {
    expect(canonicalModel("Fiat", "Ka")).toBeNull();
    expect(canonicalModel("Lada", "Niva")).toBeNull();
  });
});
