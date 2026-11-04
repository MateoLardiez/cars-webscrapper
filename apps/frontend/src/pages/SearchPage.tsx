import { useState } from "react";
import { useSearchStream } from "../hooks/useSearchStream.js";
import ResultsTable from "../components/ResultsTable.js";
import ProgressFeed from "../components/ProgressFeed.js";
import StatusBanner from "../components/StatusBanner.js";

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
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-ink)]">
            Nueva búsqueda
          </h1>
          <p className="mt-2 max-w-xl text-sm text-[var(--color-ink-dim)]">
            Describe qué estás buscando. Proporciona una URL y filtros en lenguaje natural. El agente lee la página, normaliza precios y distancia, y guarda coincidencias en tiempo real.
          </p>
        </div>

        <label htmlFor="query" className="sr-only">
          Consulta de búsqueda
        </label>
        <textarea
          id="query"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={PLACEHOLDER}
          rows={4}
          disabled={running}
          className="w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-4 text-sm leading-relaxed text-[var(--color-ink)] placeholder:text-[var(--color-ink-muted)] focus:border-[var(--color-accent)] disabled:opacity-60"
        />

        <div className="flex items-center justify-between">
          <span className="text-xs text-[var(--color-ink-muted)]">
            {query.length} caracteres
          </span>
          <button
            onClick={() => run(query)}
            disabled={!query.trim() || running}
            className={`rounded-md border px-5 py-2.5 text-sm font-medium transition-colors ${
              running
                ? "border-[var(--color-line)] bg-[var(--color-surface-2)] text-[var(--color-ink-dim)]"
                : "border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-accent-ink)] hover:border-[var(--color-accent-hover)] hover:bg-[var(--color-accent-hover)]"
            } disabled:cursor-not-allowed disabled:opacity-50`}
          >
            {running ? "En ejecución…" : "Ejecutar búsqueda"}
          </button>
        </div>
      </section>

      {status !== "idle" && (
        <section className="animate-fade-up space-y-6">
          <StatusBanner status={status} summary={summary} failure={failure} />
          <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
            <div>
              <SectionLabel label="Resultados" />
              <div className="mt-3">
                <ResultsTable cars={cars} />
              </div>
            </div>
            <div>
              <SectionLabel label="Actividad" />
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

function SectionLabel({ label }: { label: string }) {
  return (
    <h2 className="text-sm font-semibold text-[var(--color-ink)]">{label}</h2>
  );
}
