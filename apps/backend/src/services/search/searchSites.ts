import type { SearchFilters, SiteStatus, SseEvent } from "@cars-webscrapper/shared";
import type { Extractor, SiteEntry } from "./extractorClient.js";
import type { ToUsd, UsdRate } from "./currency.js";
import { runPipeline, type NewCar } from "./pipeline.js";

// Sites read at the same time. Inside a site everything is sequential (one page or
// one batch of details at a time), so no site gets more than one request at once.
export const MAX_PARALLEL_SITES = 3;

export type SavedCar = NewCar & { site: string };

export interface SearchSitesDeps {
  extractor: Extractor;
  toUsd: ToUsd;
  usdRate: UsdRate;
  saveCar: (car: SavedCar) => Promise<void>;
  emit: (event: SseEvent) => void;
}

export type SiteOutcome = SiteStatus & { status: "done" | "failed" };

// Activity events say which site they come from
function tagged(site: string, emit: (event: SseEvent) => void): (event: SseEvent) => void {
  return (event) => {
    if (event.type === "agent_thinking") emit({ ...event, text: `[${site}] ${event.text}` });
    else if (event.type === "tool_call") emit({ ...event, summary: `[${site}] ${event.summary}` });
    else emit(event);
  };
}

async function searchSite(site: SiteEntry, filters: SearchFilters, deps: SearchSitesDeps): Promise<SiteOutcome> {
  const emitStatus = (status: SiteStatus) => deps.emit({ type: "site_status", ...status });
  emitStatus({ site: site.id, status: "running", carsFound: 0, reason: null });

  let outcome: SiteOutcome;
  try {
    const result = await runPipeline(site.start_url, filters, {
      ...deps,
      saveCar: (car) => deps.saveCar({ ...car, site: site.id }),
      emit: tagged(site.id, deps.emit),
    });
    if (result.kind === "done") {
      outcome = { site: site.id, status: "done", carsFound: result.saved, reason: null };
    } else if (result.kind === "unsupported") {
      outcome = { site: site.id, status: "failed", carsFound: 0, reason: "No adapter for this site" };
    } else {
      // The cars saved before the failure stay saved
      outcome = { site: site.id, status: "failed", carsFound: result.saved, reason: result.reason };
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Unknown error";
    outcome = { site: site.id, status: "failed", carsFound: 0, reason };
  }
  emitStatus(outcome);
  return outcome;
}

// Runs the code pipeline on every site with an adapter. A site that fails does not
// stop the others: its failure is reported in its outcome and as a `site_status` event.
export async function searchSites(filters: SearchFilters, deps: SearchSitesDeps): Promise<SiteOutcome[]> {
  const { sites } = await deps.extractor.sites();
  const outcomes: SiteOutcome[] = new Array<SiteOutcome>(sites.length);

  let next = 0;
  const worker = async () => {
    while (next < sites.length) {
      const index = next++;
      const site = sites[index];
      if (site) outcomes[index] = await searchSite(site, filters, deps);
    }
  };
  await Promise.all(Array.from({ length: Math.min(MAX_PARALLEL_SITES, sites.length) }, worker));
  return outcomes;
}

// A search is failed only when no site gave anything. Failed sites are listed either way.
export function summarizeOutcomes(outcomes: SiteOutcome[]): { status: "done" | "failed"; failureReason: string | null } {
  if (outcomes.length === 0) return { status: "failed", failureReason: "No sites available" };
  const failures = outcomes.filter((outcome) => outcome.status === "failed");
  const failureReason = failures.length === 0 ? null : failures.map((o) => `${o.site}: ${o.reason}`).join("; ");
  const worked = outcomes.some((outcome) => outcome.status === "done" || outcome.carsFound > 0);
  return { status: worked ? "done" : "failed", failureReason };
}
