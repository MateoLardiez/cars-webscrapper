import { CircleAlert, CircleCheck, LoaderCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

interface Props {
  status: "idle" | "running" | "done" | "failed";
  summary: { carsFound: number; durationMs: number } | null;
  failure: string | null;
}

export default function StatusBanner({ status, summary, failure }: Props) {
  if (status === "idle") return null;

  const config = {
    running: {
      title: "En ejecución",
      detail: "El agente está navegando la página…",
      Icon: LoaderCircle,
      tone: "text-primary",
      spin: true,
    },
    done: {
      title: "Completado",
      detail: summary
        ? `${summary.carsFound} autos · ${(summary.durationMs / 1000).toFixed(1)} s`
        : "",
      Icon: CircleCheck,
      tone: "text-success",
      spin: false,
    },
    failed: {
      title: "Fallido",
      detail: failure ?? "Error desconocido",
      Icon: CircleAlert,
      tone: "",
      spin: false,
    },
  }[status];

  return (
    <Alert
      role="status"
      variant={status === "failed" ? "destructive" : "default"}
      className={cn(status !== "failed" && config.tone)}
    >
      <config.Icon aria-hidden="true" className={cn(config.spin && "animate-spin")} />
      <AlertTitle>{config.title}</AlertTitle>
      {config.detail && (
        <AlertDescription className="text-muted-foreground">{config.detail}</AlertDescription>
      )}
    </Alert>
  );
}
