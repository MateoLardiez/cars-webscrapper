import { CircleAlert, CircleCheck, Clock, LoaderCircle } from "lucide-react";
import type { Search } from "@cars-webscrapper/shared";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const CONFIG = {
  running: { label: "En curso", tone: "text-primary", Icon: LoaderCircle, spin: true },
  done: { label: "Completada", tone: "text-success", Icon: CircleCheck, spin: false },
  failed: { label: "Fallida", tone: "text-destructive", Icon: CircleAlert, spin: false },
  timeout: { label: "Tiempo agotado", tone: "text-destructive", Icon: Clock, spin: false },
} as const;

// Estado de una búsqueda guardada. Se reutiliza en el historial y en el detalle.
export default function StatusBadge({ status }: { status: Search["status"] }) {
  const { label, tone, Icon, spin } = CONFIG[status];
  return (
    <Badge variant="outline" className={cn("gap-1", tone)}>
      <Icon aria-hidden="true" className={cn(spin && "animate-spin")} />
      {label}
    </Badge>
  );
}
