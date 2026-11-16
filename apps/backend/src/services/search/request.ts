import { z } from "zod";
import type { SearchFilters } from "@cars-webscrapper/shared";
import { canonicalBrand, canonicalModel } from "./catalog.js";

const amount = z.number().nonnegative().nullable().default(null);
const colors = z.array(z.string().trim().min(1)).default([]);

const RequestSchema = z.object({
  minPriceUsd: amount,
  maxPriceUsd: amount,
  minKm: amount,
  maxKm: amount,
  minYear: amount,
  maxYear: amount,
  transmission: z.enum(["manual", "automatic"]).nullable().default(null),
  includeColors: colors,
  excludeColors: colors,
  brand: z.string().nullable().default(null),
  model: z.string().nullable().default(null),
});

export type SearchRequestResult = { ok: true; filters: SearchFilters } | { ok: false; error: string };

function rangeError(label: string, min: number | null, max: number | null): string | null {
  return min !== null && max !== null && min > max ? `${label}: el mínimo es mayor que el máximo` : null;
}

// Validates the body of POST /searches and turns brand and model into catalog names
export function parseSearchRequest(body: unknown): SearchRequestResult {
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: `Invalid filters: ${issue?.path.join(".") ?? ""} ${issue?.message ?? ""}`.trim() };
  }
  const filters: SearchFilters = parsed.data;

  const error =
    rangeError("Precio", filters.minPriceUsd, filters.maxPriceUsd) ??
    rangeError("Kilometraje", filters.minKm, filters.maxKm) ??
    rangeError("Año", filters.minYear, filters.maxYear);
  if (error !== null) return { ok: false, error };

  if (filters.model !== null && filters.brand === null) {
    return { ok: false, error: "A model needs a brand" };
  }
  if (filters.brand !== null) {
    const brand = canonicalBrand(filters.brand);
    if (brand === null) return { ok: false, error: `Unknown brand: ${filters.brand}` };
    filters.brand = brand;
    if (filters.model !== null) {
      const model = canonicalModel(brand, filters.model);
      if (model === null) return { ok: false, error: `Unknown model for ${brand}: ${filters.model}` };
      filters.model = model;
    }
  }
  return { ok: true, filters };
}
