import { useEffect, useState } from "react";
import type { Search, Car } from "@cars-webscrapper/shared";
import { getSearch } from "../lib/api.js";

export function useSearchDetail(id: number) {
  const [data, setData] = useState<(Search & { cars: Car[] }) | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSearch(id)
      .then(setData)
      .finally(() => setLoading(false));
  }, [id]);

  return { data, loading };
}
