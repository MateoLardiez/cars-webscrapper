import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Catalog, CatalogBrand } from "@cars-webscrapper/shared";

// One JSON file shared with the Python adapters (tools/scrapling/cars_extractors/catalog.py)
const CATALOG_PATH = fileURLToPath(new URL("../../../../shared/catalog.json", import.meta.url));

let cached: Catalog | null = null;

export function getCatalog(): Catalog {
  cached ??= JSON.parse(readFileSync(CATALOG_PATH, "utf-8")) as Catalog;
  return cached;
}

export function normalizeName(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim().replace(/\s+/g, " ");
}

interface Named {
  name: string;
  aliases: string[];
}

// The entry whose longest name starts the text, ending at a word boundary
function longestMatch<T extends Named>(entries: T[], text: string): { entry: T; name: string } | null {
  let best: { entry: T; name: string } | null = null;
  for (const entry of entries) {
    for (const alias of [entry.name, ...entry.aliases]) {
      const name = normalizeName(alias);
      const starts = text === name || text.startsWith(`${name} `);
      if (starts && (best === null || name.length > best.name.length)) best = { entry, name };
    }
  }
  return best;
}

export function canonicalBrand(raw: string): string | null {
  const text = normalizeName(raw);
  const found = longestMatch(getCatalog().brands, text);
  // The whole text must be the brand
  return found !== null && found.name === text ? found.entry.name : null;
}

function findBrand(brand: string): CatalogBrand | undefined {
  return getCatalog().brands.find((entry) => normalizeName(entry.name) === normalizeName(brand));
}

// The catalog model that starts the text: "Gol Trend" gives "Gol"
export function canonicalModel(brand: string, raw: string): string | null {
  const entry = findBrand(brand);
  if (entry === undefined) return null;
  return longestMatch(entry.models, normalizeName(raw))?.entry.name ?? null;
}
