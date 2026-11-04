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
    <div className="space-y-8">
      <Link
        to="/history"
        className="inline-block text-sm text-[var(--color-ink-dim)] transition-colors hover:text-[var(--color-accent)]"
      >
        Volver al historial
      </Link>

      <section>
        <p className="text-xs text-[var(--color-ink-muted)]">Búsqueda #{data.id}</p>
        <h1 className="mt-1 max-w-3xl text-xl font-semibold leading-snug tracking-tight text-[var(--color-ink)]">
          {data.query}
        </h1>
        <dl className="mt-6 grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-4">
          <Meta label="Cuándo" value={new Date(data.createdAt).toLocaleString("es-AR")} />
          <Meta label="Fuente" value={hostname(data.sourceUrl)} />
          <Meta label="Estado" value={STATUS_LABEL[data.status]} />
          <Meta label="Autos" value={String(data.carsFound)} />
        </dl>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-[var(--color-ink)]">Resultados</h2>
        <div className="mt-3">
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
      <dd className="mt-1 text-sm text-[var(--color-ink)]">{value}</dd>
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
