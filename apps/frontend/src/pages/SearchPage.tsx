import { useSearchStream } from "../hooks/useSearchStream.js";
import { useCatalog } from "../hooks/useCatalog.js";
import ResultsTable from "../components/ResultsTable.js";
import ProgressFeed from "../components/ProgressFeed.js";
import SearchForm from "../components/SearchForm.js";
import SiteStatuses from "../components/SiteStatuses.js";
import StatusBanner from "../components/StatusBanner.js";

export default function SearchPage() {
  const { catalog, error: catalogError } = useCatalog();
  const { status, events, cars, summary, failure, sites, run } = useSearchStream();
  const running = status === "running";

  return (
    <div className="space-y-10">
      <section className="space-y-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Nueva búsqueda</h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Define qué auto quieres. La búsqueda corre en todos los sitios disponibles, normaliza precios y
            kilometraje, y guarda las coincidencias en tiempo real.
          </p>
        </div>
        {catalogError && (
          <p role="alert" className="text-sm text-destructive">
            {catalogError}. Puedes buscar sin marca ni modelo.
          </p>
        )}
        <SearchForm catalog={catalog} running={running} onSubmit={run} />
      </section>

      {status !== "idle" && (
        <section className="space-y-6">
          <StatusBanner status={status} summary={summary} failure={failure} />
          <SiteStatuses sites={sites} />
          <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
            <div>
              <h2 className="text-sm font-semibold">Resultados</h2>
              <div className="mt-3">
                <ResultsTable cars={cars} loading={running} />
              </div>
            </div>
            <div>
              <h2 className="text-sm font-semibold">Actividad</h2>
              <div className="mt-3">
                <ProgressFeed events={events} />
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
