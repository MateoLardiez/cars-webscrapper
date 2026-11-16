import type { SearchFilters } from "@cars-webscrapper/shared";

const number = (n: number) => n.toLocaleString("es-AR", { maximumFractionDigits: 0 });

interface RangeText {
  both: (min: number, max: number) => string;
  max: (max: number) => string;
  min: (min: number) => string;
}

function describeRange(min: number | null, max: number | null, text: RangeText): string | null {
  if (min !== null && max !== null) return text.both(min, max);
  if (max !== null) return text.max(max);
  if (min !== null) return text.min(min);
  return null;
}

// A short Spanish summary of the filters. It is the `query` shown in the history.
export function describeFilters(filters: SearchFilters): string {
  const transmission = { manual: "manual", automatic: "automática" };
  const parts: (string | null)[] = [
    [filters.brand, filters.model].filter(Boolean).join(" ") || null,
    describeRange(filters.minPriceUsd, filters.maxPriceUsd, {
      both: (a, b) => `USD ${number(a)} a ${number(b)}`,
      max: (b) => `hasta USD ${number(b)}`,
      min: (a) => `desde USD ${number(a)}`,
    }),
    describeRange(filters.minKm, filters.maxKm, {
      both: (a, b) => `${number(a)} a ${number(b)} km`,
      max: (b) => `hasta ${number(b)} km`,
      min: (a) => `desde ${number(a)} km`,
    }),
    describeRange(filters.minYear, filters.maxYear, {
      both: (a, b) => `años ${a} a ${b}`,
      max: (b) => `año hasta ${b}`,
      min: (a) => `año desde ${a}`,
    }),
    filters.transmission === null ? null : transmission[filters.transmission],
    filters.includeColors.length > 0 ? `color ${filters.includeColors.join(", ")}` : null,
    filters.excludeColors.length > 0 ? `sin ${filters.excludeColors.join(", ")}` : null,
  ];
  return parts.filter((part): part is string => part !== null).join(" · ") || "Todos los autos";
}
