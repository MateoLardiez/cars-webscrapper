import { Link } from "react-router-dom";
import { useSearchHistory } from "../hooks/useSearchHistory.js";
import type { Search } from "@cars-webscrapper/shared";

export default function HistoryPage() {
  const { searches, loading } = useSearchHistory();

  return (
    <div className="space-y-8">
      <h2 className="font-serif text-4xl italic text-[var(--color-ink)]">
        Búsquedas anteriores.
      </h2>

      {loading && <p className="text-sm text-[var(--color-ink-muted)]">Cargando…</p>}

      {!loading && searches.length === 0 && (
        <div className="rounded-lg border border-dashed border-[var(--color-line)] bg-[var(--color-surface)]/40 p-10 text-center">
          <p className="text-sm text-[var(--color-ink-muted)]">Todavía no hay búsquedas.</p>
        </div>
      )}

      {!loading && searches.length > 0 && (
        <ol className="space-y-1">
          {searches.map((s, i) => (
            <HistoryRow key={s.id} search={s} index={searches.length - i} />
          ))}
        </ol>
      )}
    </div>
  );
}

const STATUS_LABEL: Record<Search["status"], string> = {
  done: "Completada",
  running: "En curso",
  failed: "Fallida",
  timeout: "Tiempo agotado",
};

function HistoryRow({ search, index }: { search: Search; index: number }) {
  const statusColor = {
    done: "var(--color-emerald)",
    running: "var(--color-amber)",
    failed: "var(--color-rose)",
    timeout: "var(--color-rose)",
  }[search.status];

  return (
    <li>
      <Link
        to={`/history/${search.id}`}
        className="group flex items-center gap-4 rounded-lg border border-transparent px-4 py-4 transition-colors hover:border-[var(--color-line)] hover:bg-[var(--color-surface)] sm:gap-6"
      >
        <span className="w-8 shrink-0 font-mono text-xs text-[var(--color-ink-muted)]">
          {String(index).padStart(3, "0")}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-serif text-lg italic text-[var(--color-ink)] transition-colors group-hover:text-[var(--color-amber)]">
            {search.query}
          </p>
          <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
            {hostname(search.sourceUrl)} · {new Date(search.createdAt).toLocaleString("es-AR")}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-mono text-lg text-[var(--color-ink)]">{search.carsFound}</p>
          <p className="text-xs text-[var(--color-ink-muted)]">autos</p>
        </div>
        <span
          className="shrink-0 font-mono text-xs uppercase tracking-wider"
          style={{ color: statusColor }}
        >
          ● {STATUS_LABEL[search.status]}
        </span>
      </Link>
    </li>
  );
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "—";
  }
}
