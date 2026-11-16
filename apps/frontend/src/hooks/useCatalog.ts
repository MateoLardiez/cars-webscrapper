import { useEffect, useState } from "react";
import type { Catalog } from "@cars-webscrapper/shared";
import { getCatalog } from "../lib/api.js";

export function useCatalog() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getCatalog()
      .then(setCatalog)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Error desconocido"));
  }, []);

  return { catalog, error };
}
