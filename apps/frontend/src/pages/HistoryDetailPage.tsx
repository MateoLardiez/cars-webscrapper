import { Link, useParams } from "react-router-dom";
import { useSearchDetail } from "../hooks/useSearchDetail.js";
import ResultsTable from "../components/ResultsTable.js";

export default function HistoryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, loading } = useSearchDetail(Number(id));

  if (loading) {
    return <p className="font-mono text-xs text-[var(--color-ink-muted)]">cargando...</p>;
  }
  if (!data) {
    return <p className="font-mono text-xs text-[var(--color-ink-muted)]">no encontrado</p>;
  }

  return (
    <div className="space-y-10">
      <Link
        to="/history"
        className="inline-block font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--color-ink-muted)] hover:text-[var(--color-amber)]"
      >
        ← volver al archivo
      </Link>

      <section>
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--color-amber)]">
          Captura #{data.id}
        </p>
        <blockquote className="mt-3 border-l-2 border-[var(--color-amber)] pl-5 font-serif text-2xl italic leading-snug text-[var(--color-ink)]">
          {data.query}
        </blockquote>
        <dl className="mt-6 grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-4 font-mono text-xs">
          <Meta label="Cuándo" value={new Date(data.createdAt).toLocaleString()} />
          <Meta label="Fuente" value={hostname(data.sourceUrl)} />
          <Meta label="Estado" value={data.status} />
          <Meta label="Autos" value={String(data.carsFound)} />
        </dl>
      </section>

      <section>
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--color-amber)]">
          Resultados
        </p>
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
      <dt className="text-[9px] uppercase tracking-[0.25em] text-[var(--color-ink-muted)]">{label}</dt>
      <dd className="mt-1 text-[var(--color-ink-dim)]">{value}</dd>
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
