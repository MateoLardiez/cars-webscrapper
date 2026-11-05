import { useState, useEffect, useRef } from "react";
import type { SseEvent } from "@cars-webscrapper/shared";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { formatUsage } from "@/lib/format";

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
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="flex items-center justify-between px-4 py-2.5">
        <span className="text-xs text-muted-foreground">Registro del agente</span>
        <div className="flex items-center gap-2">
          <Checkbox
            id="show-thoughts"
            checked={showThoughts}
            onCheckedChange={(checked) => setShowThoughts(checked === true)}
          />
          <Label htmlFor="show-thoughts" className="text-xs font-normal text-muted-foreground">
            Mostrar razonamiento
          </Label>
        </div>
      </div>
      <Separator />
      <ul
        ref={scrollRef}
        className="max-h-[480px] space-y-2.5 overflow-y-auto p-3 font-mono text-xs leading-relaxed"
      >
        {visible.length === 0 && (
          <li className="text-muted-foreground">Sin actividad todavía.</li>
        )}
        {visible.map((e, i) => (
          <li key={i} className="animate-slide-in flex items-start gap-2">
            <Tag type={e.type} />
            <span className="min-w-0 flex-1 break-words text-muted-foreground">{getText(e)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const TAGS: Record<SseEvent["type"], { text: string; tone: string }> = {
  agent_thinking: { text: "razonamiento", tone: "text-muted-foreground" },
  tool_call: { text: "herramienta", tone: "text-primary" },
  car_saved: { text: "guardado", tone: "text-success" },
  extraction_failed: { text: "error", tone: "text-destructive" },
  done: { text: "listo", tone: "text-success" },
};

function Tag({ type }: { type: SseEvent["type"] }) {
  const { text, tone } = TAGS[type];
  return (
    <Badge variant="outline" className={cn("shrink-0 font-mono", tone)}>
      {text}
    </Badge>
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
      return [`${e.carsFound} autos · ${(e.durationMs / 1000).toFixed(1)} s`, formatUsage(e.usage)]
        .filter(Boolean)
        .join(" · ");
  }
}
