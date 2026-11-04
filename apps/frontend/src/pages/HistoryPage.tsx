import { Link } from "react-router-dom";
import { useSearchHistory } from "../hooks/useSearchHistory.js";
import type { Search } from "@cars-webscrapper/shared";

export default function HistoryPage() {
  const { searches, loading } = useSearchHistory();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-ink)]">Historial</h1>

      {loading && <p className="text-sm text-[var(--color-ink-muted)]">Cargando…</p>}

      {!loading && searches.length === 0 && (
        <div className="rounded-lg border border-dashed border-[var(--color-line)] p-10 text-center">
          <p className="text-sm text-[var(--color-ink-muted)]">Todavía no hay búsquedas.</p>
        </div>
      )}

      {!loading && searches.length > 0 && (
        <ol className="divide-y divide-[var(--color-line)] overflow-hidden rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)]">
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
    done: "var(--color-success)",
    running: "var(--color-accent)",
    failed: "var(--color-danger)",
    timeout: "var(--color-danger)",
  }[search.status];

  return (
    <li>
      <Link
        to={`/history/${search.id}`}
        className="group flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-[var(--color-surface-2)] sm:gap-6"
      >
        <span className="w-8 shrink-0 font-mono text-xs text-[var(--color-ink-muted)]">
          {String(index).padStart(3, "0")}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-[var(--color-ink)]">{search.query}</p>
          <p className="mt-0.5 text-xs text-[var(--color-ink-muted)]">
            {hostname(search.sourceUrl)} · {new Date(search.createdAt).toLocaleString("es-AR")}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-mono text-base tabular-nums text-[var(--color-ink)]">
            {search.carsFound}
          </p>
          <p className="text-xs text-[var(--color-ink-muted)]">autos</p>
        </div>
        <span
          className="flex w-32 shrink-0 items-center justify-end gap-2 text-xs font-medium"
          style={{ color: statusColor }}
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: statusColor }}
            aria-hidden="true"
          />
          {STATUS_LABEL[search.status]}
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
