interface Props {
  status: "idle" | "running" | "done" | "failed";
  summary: { carsFound: number; durationMs: number } | null;
  failure: string | null;
}

export default function StatusBanner({ status, summary, failure }: Props) {
  if (status === "idle") return null;

  const config = {
    running: {
      tag: "En ejecución",
      color: "var(--color-amber)",
      detail: "agente navegando la página...",
      dot: "animate-pulse",
    },
    done: {
      tag: "Completado",
      color: "var(--color-emerald)",
      detail: summary
        ? `${summary.carsFound} autos · ${(summary.durationMs / 1000).toFixed(1)}s`
        : "",
      dot: "",
    },
    failed: {
      tag: "Fallido",
      color: "var(--color-rose)",
      detail: failure ?? "Error desconocido",
      dot: "",
    },
  }[status];

  return (
    <div
      className="flex items-center gap-4 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-5 py-4"
      style={{ boxShadow: `0 0 40px -20px ${config.color}` }}
    >
      <span
        className={`h-2 w-2 rounded-full ${config.dot}`}
        style={{ background: config.color }}
      />
      <span
        className="font-mono text-[10px] uppercase tracking-[0.3em]"
        style={{ color: config.color }}
      >
        {config.tag}
      </span>
      <span className="font-mono text-xs text-[var(--color-ink-dim)]">
        {config.detail}
      </span>
    </div>
  );
}
