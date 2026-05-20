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
    <div className="space-y-12">
      <section className="space-y-6">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--color-amber)]">
            01 / Consulta
          </p>
          <h2 className="mt-2 font-serif text-4xl italic leading-tight text-[var(--color-ink)]">
            Describe qué estás buscando.
          </h2>
          <p className="mt-2 max-w-xl text-sm text-[var(--color-ink-dim)]">
            Proporciona una URL y filtros en lenguaje natural. El agente lee la página, normaliza precios y distancia, y guarda coincidencias en tiempo real.
          </p>
        </div>

        <div className="group relative">
          <div className="absolute -inset-px rounded-lg bg-gradient-to-br from-[var(--color-amber)]/30 via-transparent to-[var(--color-amber-dim)]/20 opacity-0 transition-opacity group-focus-within:opacity-100" />
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={PLACEHOLDER}
            rows={4}
            disabled={running}
            className="relative w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-5 font-mono text-sm leading-relaxed text-[var(--color-ink)] placeholder:text-[var(--color-ink-muted)] focus:border-[var(--color-amber)]/60 focus:outline-none disabled:opacity-60"
          />
        </div>

        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--color-ink-muted)]">
            {query.length} caracteres
          </span>
          <button
            onClick={() => run(query)}
            disabled={!query.trim() || running}
            className={`group relative overflow-hidden rounded-full border px-7 py-3 font-mono text-xs uppercase tracking-[0.25em] transition-all ${
              running
                ? "border-[var(--color-amber)]/40 bg-[var(--color-amber)]/10 text-[var(--color-amber)] animate-pulse-amber"
                : "border-[var(--color-amber)] bg-[var(--color-amber)] text-[var(--color-canvas)] hover:bg-[var(--color-ink)] hover:border-[var(--color-ink)]"
            } disabled:cursor-not-allowed disabled:opacity-40`}
          >
            <span className="relative z-10">
              {running ? "En ejecución" : "Ejecutar búsqueda →"}
              {running && <span className="animate-blink ml-1">_</span>}
            </span>
          </button>
        </div>
      </section>

      {status !== "idle" && (
        <section className="space-y-6 animate-fade-up">
          <StatusBanner status={status} summary={summary} failure={failure} />
          <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
            <div>
              <SectionLabel index="02" label="Resultados" />
              <div className="mt-4">
                <ResultsTable cars={cars} />
              </div>
            </div>
            <div>
              <SectionLabel index="03" label="Actividad" />
              <div className="mt-4">
                <ProgressFeed events={events} />
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function SectionLabel({ index, label }: { index: string; label: string }) {
  return (
    <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--color-amber)]">
      {index} / {label}
    </p>
  );
}
