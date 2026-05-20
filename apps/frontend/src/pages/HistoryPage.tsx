import { Link } from "react-router-dom";
import { useSearchHistory } from "../hooks/useSearchHistory.js";
import type { Search } from "@cars-webscrapper/shared";

export default function HistoryPage() {
  const { searches, loading } = useSearchHistory();

  return (
    <div className="space-y-8">
      <div>
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--color-amber)]">
          Archivo
        </p>
        <h2 className="mt-2 font-serif text-4xl italic text-[var(--color-ink)]">
          Búsquedas anteriores.
        </h2>
      </div>

      {loading && (
        <p className="font-mono text-xs text-[var(--color-ink-muted)]">cargando...</p>
      )}

      {!loading && searches.length === 0 && (
        <div className="rounded-lg border border-dashed border-[var(--color-line)] bg-[var(--color-surface)]/40 p-10 text-center">
          <p className="font-mono text-xs uppercase tracking-[0.25em] text-[var(--color-ink-muted)]">
            Sin búsquedas aún
          </p>
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
        className="group flex items-center gap-6 rounded-lg border border-transparent px-4 py-4 transition-all hover:border-[var(--color-line)] hover:bg-[var(--color-surface)]"
      >
        <span className="w-8 shrink-0 font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--color-ink-muted)]">
          {String(index).padStart(3, "0")}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-serif text-lg italic text-[var(--color-ink)] group-hover:text-[var(--color-amber)] transition-colors">
            {search.query}
          </p>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--color-ink-muted)]">
            {hostname(search.sourceUrl)} · {new Date(search.createdAt).toLocaleString()}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-mono text-lg text-[var(--color-ink)]">{search.carsFound}</p>
          <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--color-ink-muted)]">autos</p>
        </div>
        <span
          className="shrink-0 font-mono text-[10px] uppercase tracking-[0.25em]"
          style={{ color: statusColor }}
        >
          ● {search.status}
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
