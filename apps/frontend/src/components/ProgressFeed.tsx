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
    <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] overflow-hidden">
      <div className="flex items-center justify-between border-b border-[var(--color-line)] bg-[var(--color-surface-2)]/60 px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-emerald)] animate-pulse" />
          <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--color-ink-dim)]">
            agent.log
          </span>
        </div>
        <label className="flex cursor-pointer items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--color-ink-muted)] hover:text-[var(--color-ink-dim)]">
          <input
            type="checkbox"
            checked={showThoughts}
            onChange={(e) => setShowThoughts(e.target.checked)}
            className="h-3 w-3 accent-[var(--color-amber)]"
          />
          thoughts
        </label>
      </div>
      <ul
        ref={scrollRef}
        className="max-h-[480px] space-y-1.5 overflow-y-auto p-3 font-mono text-[11px] leading-relaxed"
      >
        {visible.length === 0 && (
          <li className="text-[var(--color-ink-muted)]">
            <span className="animate-blink">_</span>
          </li>
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
    agent_thinking: { text: "think", color: "text-[var(--color-ink-muted)]" },
    tool_call: { text: "tool", color: "text-[var(--color-amber)]" },
    car_saved: { text: "save", color: "text-[var(--color-emerald)]" },
    extraction_failed: { text: "fail", color: "text-[var(--color-rose)]" },
    done: { text: "done", color: "text-[var(--color-emerald)]" },
  };
  const { text, color } = map[type];
  return (
    <span className={`shrink-0 ${color} uppercase tracking-wider`}>[{text}]</span>
  );
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
      return `${e.carsFound} cars · ${e.durationMs}ms`;
  }
}
