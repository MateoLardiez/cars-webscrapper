import { Link, useParams } from "react-router-dom";
import { useSearchDetail } from "../hooks/useSearchDetail.js";
import ResultsTable from "../components/ResultsTable.js";
import type { Search } from "@cars-webscrapper/shared";

const STATUS_LABEL: Record<Search["status"], string> = {
  done: "Completada",
  running: "En curso",
  failed: "Fallida",
  timeout: "Tiempo agotado",
};

export default function HistoryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, loading } = useSearchDetail(Number(id));

  if (loading) {
    return <p className="text-sm text-[var(--color-ink-muted)]">Cargando…</p>;
  }
  if (!data) {
    return <p className="text-sm text-[var(--color-ink-muted)]">Búsqueda no encontrada.</p>;
  }

  return (
    <div className="space-y-10">
      <Link
        to="/history"
        className="inline-block text-sm text-[var(--color-ink-dim)] transition-colors hover:text-[var(--color-amber)]"
      >
        Volver al historial
      </Link>

      <section>
        <h2 className="text-xs text-[var(--color-ink-muted)]">Búsqueda #{data.id}</h2>
        <blockquote className="mt-3 border-l border-[var(--color-line)] pl-5 font-serif text-2xl italic leading-snug text-[var(--color-ink)]">
          {data.query}
        </blockquote>
        <dl className="mt-6 grid grid-cols-2 gap-x-8 gap-y-4 font-mono text-xs sm:grid-cols-4">
          <Meta label="Cuándo" value={new Date(data.createdAt).toLocaleString("es-AR")} />
          <Meta label="Fuente" value={hostname(data.sourceUrl)} />
          <Meta label="Estado" value={STATUS_LABEL[data.status]} />
          <Meta label="Autos" value={String(data.carsFound)} />
        </dl>
      </section>

      <section>
        <h3 className="font-mono text-xs uppercase tracking-wider text-[var(--color-amber)]">
          Resultados
        </h3>
        <div className="mt-4">
          <ResultsTable cars={data.cars} />
        </div>
      </section>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-[var(--color-ink-muted)]">{label}</dt>
      <dd className="mt-1 text-sm text-[var(--color-ink-dim)]">{value}</dd>
    </div>
  );
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "—";
  }
}
