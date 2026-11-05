import { useState } from "react";
import { LoaderCircle, Search } from "lucide-react";
import { useSearchStream } from "../hooks/useSearchStream.js";
import ResultsTable from "../components/ResultsTable.js";
import ProgressFeed from "../components/ProgressFeed.js";
import StatusBanner from "../components/StatusBanner.js";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const PLACEHOLDER =
  "ej. Busca autos en https://www.kavak.com/ar por debajo de $10.000 USD, menos de 100.000 km, manual, sin amarillo o verde";

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const { status, events, cars, summary, failure, run } = useSearchStream();
  const running = status === "running";

  return (
    <div className="space-y-10">
      <section className="space-y-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Nueva búsqueda</h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Describe qué estás buscando. Proporciona una URL y filtros en lenguaje natural. El agente lee la página, normaliza precios y distancia, y guarda coincidencias en tiempo real.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="query" className="sr-only">
            Consulta de búsqueda
          </Label>
          <Textarea
            id="query"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={PLACEHOLDER}
            rows={4}
            disabled={running}
            className="min-h-44 bg-card text-sm leading-relaxed sm:min-h-24"
          />
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{query.length} caracteres</span>
          <Button size="lg" onClick={() => run(query)} disabled={!query.trim() || running}>
            {running ? (
              <>
                <LoaderCircle className="animate-spin" aria-hidden="true" data-icon="inline-start" />
                En ejecución…
              </>
            ) : (
              <>
                <Search aria-hidden="true" data-icon="inline-start" />
                Ejecutar búsqueda
              </>
            )}
          </Button>
        </div>
      </section>

      {status !== "idle" && (
        <section className="space-y-6">
          <StatusBanner status={status} summary={summary} failure={failure} />
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
