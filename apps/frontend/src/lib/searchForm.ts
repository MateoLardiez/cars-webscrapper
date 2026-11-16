import type { SearchFilters } from "@cars-webscrapper/shared";

// The form keeps what the user typed as text, so a half-typed number is not lost
export interface SearchForm {
  minPrice: string;
  maxPrice: string;
  minKm: string;
  maxKm: string;
  minYear: string;
  maxYear: string;
  transmission: "any" | "manual" | "automatic";
  brand: string;
  model: string;
  includeColors: string[];
  excludeColors: string[];
}

export const EMPTY_FORM: SearchForm = {
  minPrice: "",
  maxPrice: "",
  minKm: "",
  maxKm: "",
  minYear: "",
  maxYear: "",
  transmission: "any",
  brand: "",
  model: "",
  includeColors: [],
  excludeColors: [],
};

function toNumber(text: string): number | null {
  if (text.trim() === "") return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

export function formToFilters(form: SearchForm): SearchFilters {
  const brand = form.brand || null;
  return {
    minPriceUsd: toNumber(form.minPrice),
    maxPriceUsd: toNumber(form.maxPrice),
    minKm: toNumber(form.minKm),
    maxKm: toNumber(form.maxKm),
    minYear: toNumber(form.minYear),
    maxYear: toNumber(form.maxYear),
    transmission: form.transmission === "any" ? null : form.transmission,
    includeColors: form.includeColors,
    excludeColors: form.excludeColors,
    brand,
    // A model only makes sense inside a brand
    model: brand === null ? null : form.model || null,
  };
}

// The first problem in the form, in Spanish for the user. Null when it can be sent.
export function formError(form: SearchForm): string | null {
  const ranges = [
    ["Precio", form.minPrice, form.maxPrice],
    ["Kilometraje", form.minKm, form.maxKm],
    ["Año", form.minYear, form.maxYear],
  ] as const;
  for (const [label, minText, maxText] of ranges) {
    const min = toNumber(minText);
    const max = toNumber(maxText);
    if ((min !== null && min < 0) || (max !== null && max < 0)) return `${label}: no puede ser negativo`;
    if (min !== null && max !== null && min > max) return `${label}: el mínimo es mayor que el máximo`;
  }
  return null;
}
