import { useEffect, useState } from "react";
import type { Search } from "@cars-webscrapper/shared";
import { listSearches } from "../lib/api.js";

export function useSearchHistory() {
  const [searches, setSearches] = useState<Search[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listSearches()
      .then(setSearches)
      .finally(() => setLoading(false));
  }, []);

  return { searches, loading };
}
