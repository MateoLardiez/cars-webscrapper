import { CircleAlert, CircleCheck, LoaderCircle } from "lucide-react";
import type { SiteStatus } from "@cars-webscrapper/shared";
import { cn } from "@/lib/utils";

// One row per site: whether it is still running, how many cars it gave, why it failed
export default function SiteStatuses({ sites }: { sites: SiteStatus[] }) {
  if (sites.length === 0) return null;
  return (
    <ul className="divide-y rounded-lg border bg-card text-sm" aria-label="Estado por sitio">
      {sites.map((site) => (
        <li key={site.site} className="flex items-start gap-3 px-4 py-2.5">
          <StatusIcon status={site.status} />
          <span className="font-medium capitalize">{site.site}</span>
          <span className={cn("min-w-0 flex-1 break-words", site.status === "failed" ? "text-destructive" : "text-muted-foreground")}>
            {describe(site)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function describe(site: SiteStatus): string {
  if (site.status === "running") return "Buscando…";
  if (site.status === "failed") {
    const saved = site.carsFound > 0 ? ` (${site.carsFound} autos guardados antes del error)` : "";
    return `Falló: ${site.reason ?? "error desconocido"}${saved}`;
  }
  return `${site.carsFound} autos`;
}

function StatusIcon({ status }: { status: SiteStatus["status"] }) {
  const common = "mt-0.5 size-4 shrink-0";
  if (status === "running") return <LoaderCircle aria-hidden="true" className={cn(common, "animate-spin text-primary")} />;
  if (status === "failed") return <CircleAlert aria-hidden="true" className={cn(common, "text-destructive")} />;
  return <CircleCheck aria-hidden="true" className={cn(common, "text-success")} />;
}
