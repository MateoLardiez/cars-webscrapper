import { Link } from "react-router-dom";
import { History } from "lucide-react";
import { useSearchHistory } from "../hooks/useSearchHistory.js";
import StatusBadge from "../components/StatusBadge.js";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function HistoryPage() {
  const { searches, loading } = useSearchHistory();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Historial</h1>

      {loading && (
        <div className="space-y-3 rounded-lg border bg-card p-4" aria-busy="true">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      )}

      {!loading && searches.length === 0 && (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <History />
            </EmptyMedia>
            <EmptyTitle>Todavía no hay búsquedas</EmptyTitle>
            <EmptyDescription>Las búsquedas que ejecutes quedarán guardadas aquí.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {!loading && searches.length > 0 && (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">N.º</TableHead>
                <TableHead>Búsqueda</TableHead>
                <TableHead className="hidden sm:table-cell">Fecha</TableHead>
                <TableHead className="text-right">Autos</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {searches.map((s, i) => (
                <TableRow key={s.id}>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {String(searches.length - i).padStart(3, "0")}
                  </TableCell>
                  <TableCell className="w-full max-w-0">
                    <Link
                      to={`/history/${s.id}`}
                      className="block truncate font-medium underline decoration-transparent underline-offset-4 transition-colors hover:text-primary hover:decoration-current"
                    >
                      {s.query}
                    </Link>
                    <span className="block text-xs text-muted-foreground">
                      {hostname(s.sourceUrl)}
                    </span>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground sm:table-cell">
                    {new Date(s.createdAt).toLocaleString("es-AR")}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{s.carsFound}</TableCell>
                  <TableCell>
                    <StatusBadge status={s.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
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
