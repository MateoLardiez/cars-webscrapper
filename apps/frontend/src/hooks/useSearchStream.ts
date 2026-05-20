import { useState, useCallback } from "react";
import type { Car, SseEvent } from "@cars-webscrapper/shared";
import { streamSearch } from "../lib/api.js";

type Status = "idle" | "running" | "done" | "failed";

export function useSearchStream() {
  const [status, setStatus] = useState<Status>("idle");
  const [events, setEvents] = useState<SseEvent[]>([]);
  const [cars, setCars] = useState<Car[]>([]);
  const [summary, setSummary] = useState<{ carsFound: number; durationMs: number } | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const run = useCallback(async (query: string) => {
    setStatus("running");
    setEvents([]);
    setCars([]);
    setSummary(null);
    setFailure(null);

    try {
      await streamSearch(query, (event) => {
        setEvents((prev) => [...prev, event]);
        if (event.type === "car_saved") {
          setCars((prev) => [...prev, event.car]);
        }
        if (event.type === "done") {
          setSummary({ carsFound: event.carsFound, durationMs: event.durationMs });
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

  return { status, events, cars, summary, failure, run };
}
