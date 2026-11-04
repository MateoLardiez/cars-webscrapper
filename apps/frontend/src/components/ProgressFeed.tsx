import { useState, useEffect, useRef } from "react";
import type { SseEvent } from "@cars-webscrapper/shared";

export default function ProgressFeed({ events }: { events: SseEvent[] }) {
  const [showThoughts, setShowThoughts] = useState(false);
  const scrollRef = useRef<HTMLUListElement>(null);

  const visible = events.filter((e) =>
    showThoughts ? true : e.type !== "agent_thinking"
  );

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [visible.length]);

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)]">
      <div className="flex items-center justify-between border-b border-[var(--color-line)] bg-[var(--color-surface-2)]/60 px-4 py-2">
        <span className="text-xs text-[var(--color-ink-dim)]">Registro del agente</span>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-[var(--color-ink-muted)] hover:text-[var(--color-ink-dim)]">
          <input
            type="checkbox"
            checked={showThoughts}
            onChange={(e) => setShowThoughts(e.target.checked)}
            className="h-3.5 w-3.5 accent-[var(--color-accent)]"
          />
          Mostrar razonamiento
        </label>
      </div>
      <ul
        ref={scrollRef}
        className="max-h-[480px] space-y-2 overflow-y-auto p-3 font-mono text-xs leading-relaxed"
      >
        {visible.length === 0 && (
          <li className="text-[var(--color-ink-muted)]">Sin actividad todavía.</li>
        )}
        {visible.map((e, i) => (
          <li key={i} className="animate-slide-in flex gap-2">
            <Tag type={e.type} />
            <span className="flex-1 break-words text-[var(--color-ink-dim)]">{getText(e)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Tag({ type }: { type: SseEvent["type"] }) {
  const map = {
    agent_thinking: { text: "razonamiento", color: "text-[var(--color-ink-muted)]" },
    tool_call: { text: "herramienta", color: "text-[var(--color-accent)]" },
    car_saved: { text: "guardado", color: "text-[var(--color-success)]" },
    extraction_failed: { text: "error", color: "text-[var(--color-danger)]" },
    done: { text: "listo", color: "text-[var(--color-success)]" },
  };
  const { text, color } = map[type];
  return <span className={`shrink-0 ${color}`}>[{text}]</span>;
}

function getText(e: SseEvent): string {
  switch (e.type) {
    case "agent_thinking":
      return e.text;
    case "tool_call":
      return `${e.name} · ${e.summary}`;
    case "car_saved":
      return e.car.name;
    case "extraction_failed":
      return e.reason;
    case "done":
      return `${e.carsFound} autos · ${(e.durationMs / 1000).toFixed(1)} s`;
  }
}
