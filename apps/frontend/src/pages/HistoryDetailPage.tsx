import { Link, useParams } from "react-router-dom";
import { ArrowLeft, SearchX } from "lucide-react";
import { useSearchDetail } from "../hooks/useSearchDetail.js";
import { formatCost, formatTokens, totalTokens } from "@/lib/format";
import ResultsTable from "../components/ResultsTable.js";
import StatusBadge from "../components/StatusBadge.js";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";

export default function HistoryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, loading } = useSearchDetail(Number(id));

  if (loading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!data) {
    return (
      <Empty className="border border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <SearchX />
          </EmptyMedia>
          <EmptyTitle>Búsqueda no encontrada</EmptyTitle>
          <EmptyDescription>Puede que se haya eliminado o que el enlace sea incorrecto.</EmptyDescription>
        </EmptyHeader>
        <Button asChild variant="outline">
          <Link to="/history">Volver al historial</Link>
        </Button>
      </Empty>
    );
  }

  return (
    <div className="space-y-8">
      <Button asChild variant="ghost" size="sm" className="-ml-2.5">
        <Link to="/history">
          <ArrowLeft aria-hidden="true" data-icon="inline-start" />
          Volver al historial
        </Link>
      </Button>

      <section>
        <p className="text-xs text-muted-foreground">Búsqueda #{data.id}</p>
        <h1 className="mt-1 max-w-3xl text-xl font-semibold leading-snug tracking-tight">
          {data.query}
        </h1>
        <dl className="mt-6 grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-4">
          <Meta label="Cuándo">{new Date(data.createdAt).toLocaleString("es-AR")}</Meta>
          <Meta label="Fuente">{hostname(data.sourceUrl)}</Meta>
          <Meta label="Estado">
            <StatusBadge status={data.status} />
          </Meta>
          <Meta label="Autos">{data.carsFound}</Meta>
          <Meta label="Costo">{data.costUsd === null ? "Sin datos" : formatCost(data.costUsd)}</Meta>
          <Meta label="Tokens">
            {data.inputTokens === null ||
            data.outputTokens === null ||
            data.cacheReadTokens === null ||
            data.cacheCreationTokens === null ? (
              "Sin datos"
            ) : (
              <>
                {formatTokens(
                  totalTokens({
                    inputTokens: data.inputTokens,
                    outputTokens: data.outputTokens,
                    cacheReadTokens: data.cacheReadTokens,
                    cacheCreationTokens: data.cacheCreationTokens,
                  })
                )}
                <span className="block text-xs text-muted-foreground">
                  entrada {formatTokens(data.inputTokens)} · salida {formatTokens(data.outputTokens)} ·
                  caché {formatTokens(data.cacheReadTokens + data.cacheCreationTokens)}
                </span>
              </>
            )}
          </Meta>
        </dl>
      </section>

      <section>
        <h2 className="text-sm font-semibold">Resultados</h2>
        <div className="mt-3">
          <ResultsTable cars={data.cars} />
        </div>
      </section>
    </div>
  );
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm">{children}</dd>
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
