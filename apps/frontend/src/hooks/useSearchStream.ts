import { useState, useCallback } from "react";
import type { Car, SearchFilters, SiteStatus, SseEvent, UsageSummary } from "@cars-webscrapper/shared";
import { streamSearch } from "../lib/api.js";

type Status = "idle" | "running" | "done" | "failed";

export function useSearchStream() {
  const [status, setStatus] = useState<Status>("idle");
  const [events, setEvents] = useState<SseEvent[]>([]);
  const [cars, setCars] = useState<Car[]>([]);
  const [summary, setSummary] = useState<{
    carsFound: number;
    durationMs: number;
    usage: UsageSummary | null;
  } | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  // Last status of each site, in the order the sites first reported
  const [sites, setSites] = useState<SiteStatus[]>([]);

  const run = useCallback(async (filters: SearchFilters) => {
    setStatus("running");
    setEvents([]);
    setCars([]);
    setSummary(null);
    setFailure(null);
    setSites([]);

    try {
      await streamSearch(filters, (event) => {
        setEvents((prev) => [...prev, event]);
        if (event.type === "site_status") {
          const { type: _type, ...status } = event;
          setSites((prev) =>
            prev.some((s) => s.site === status.site)
              ? prev.map((s) => (s.site === status.site ? status : s))
              : [...prev, status]
          );
        }
        if (event.type === "car_saved") {
          setCars((prev) => [...prev, event.car]);
        }
        if (event.type === "done") {
          setSummary({
            carsFound: event.carsFound,
            durationMs: event.durationMs,
            usage: event.usage,
          });
          setStatus("done");
        }
        if (event.type === "extraction_failed") {
          setFailure(event.reason);
          setStatus("failed");
        }
      });
    } catch (err) {
      setFailure(err instanceof Error ? err.message : "Unknown error");
      setStatus("failed");
    }
  }, []);

  return { status, events, cars, summary, failure, sites, run };
}
