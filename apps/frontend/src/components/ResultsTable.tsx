import { useState } from "react";
import { ArrowDown, ArrowUp, CarFront, ChevronsUpDown } from "lucide-react";
import type { Car } from "@cars-webscrapper/shared";
import { Button } from "@/components/ui/button";
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

type SortKey = "year" | "km" | "priceUsd";
type SortDir = "asc" | "desc";
interface Sort {
  key: SortKey;
  dir: SortDir;
}

function sortCars(cars: Car[], sort: Sort | null): Car[] {
  if (!sort) return cars;
  const { key, dir } = sort;
  const factor = dir === "asc" ? 1 : -1;
  // Los autos sin ese dato siempre van al final, sin importar la dirección.
  return [...cars].sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    return (av - bv) * factor;
  });
}

const money = (n: number) => n.toLocaleString("es-AR", { maximumFractionDigits: 0 });

interface Props {
  cars: Car[];
  /** true mientras el agente sigue buscando y todavía no llegó ningún auto */
  loading?: boolean;
}

export default function ResultsTable({ cars, loading = false }: Props) {
  const [sort, setSort] = useState<Sort | null>(null);

  if (cars.length === 0 && loading) return <ResultsSkeleton />;

  if (cars.length === 0) {
    return (
      <Empty className="border border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CarFront />
          </EmptyMedia>
          <EmptyTitle>Sin resultados</EmptyTitle>
          <EmptyDescription>Esta búsqueda no guardó ningún auto.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  // Ciclo de clic: ascendente, descendente, orden original.
  function toggleSort(key: SortKey) {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: "asc" };
      if (prev.dir === "asc") return { key, dir: "desc" };
      return null;
    });
  }

  const rows = sortCars(cars, sort);
  // Si ningún auto trae color, la columna solo ocuparía espacio con guiones.
  const showColor = cars.some((c) => c.color);

  return (
    <div className="rounded-lg border bg-card">
      <Table className="min-w-[560px]">
        <TableHeader>
          <TableRow>
            <TableHead>Auto</TableHead>
            <SortHead label="Precio" sortKey="priceUsd" sort={sort} onSort={toggleSort} />
            <SortHead label="Año" sortKey="year" sort={sort} onSort={toggleSort} />
            <SortHead label="Km" sortKey="km" sort={sort} onSort={toggleSort} />
            <TableHead>Transmisión</TableHead>
            {showColor && <TableHead>Color</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((car) => (
            <CarRow key={car.id} car={car} showColor={showColor} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function SortHead({
  label,
  sortKey,
  sort,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  sort: Sort | null;
  onSort: (key: SortKey) => void;
}) {
  const active = sort?.key === sortKey ? sort.dir : null;
  const ariaSort = active === "asc" ? "ascending" : active === "desc" ? "descending" : "none";
  const Icon = active === "asc" ? ArrowUp : active === "desc" ? ArrowDown : ChevronsUpDown;
  return (
    <TableHead aria-sort={ariaSort} className="text-right">
      <Button variant="ghost" size="sm" className="-mr-2" onClick={() => onSort(sortKey)}>
        {label}
        <Icon aria-hidden="true" data-icon="inline-end" className={active ? "text-primary" : ""} />
      </Button>
    </TableHead>
  );
}

function CarRow({ car, showColor }: { car: Car; showColor: boolean }) {
  const foreign =
    car.priceOriginal != null && car.currencyOriginal && car.currencyOriginal !== "USD";

  return (
    <TableRow>
      <TableCell className="max-w-[260px]">
        <a
          href={car.link}
          target="_blank"
          rel="noreferrer"
          className="block truncate font-medium underline decoration-transparent underline-offset-4 transition-colors hover:text-primary hover:decoration-current"
        >
          {car.name}
        </a>
        {car.model && (
          <span className="block truncate text-xs text-muted-foreground">{car.model}</span>
        )}
      </TableCell>
      <TableCell className="text-right font-mono tabular-nums">
        {car.priceUsd != null ? (
          <span className="font-medium text-primary">${money(car.priceUsd)}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
        {foreign && (
          <span className="block text-xs text-muted-foreground">
            {money(car.priceOriginal!)} {car.currencyOriginal}
          </span>
        )}
      </TableCell>
      <NumCell value={car.year?.toString()} />
      <NumCell value={car.km?.toLocaleString("es-AR")} />
      <TableCell className="text-muted-foreground">{car.transmission ?? "—"}</TableCell>
      {showColor && <TableCell className="text-muted-foreground">{car.color ?? "—"}</TableCell>}
    </TableRow>
  );
}

function NumCell({ value }: { value: string | undefined }) {
  return (
    <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
      {value ?? "—"}
    </TableCell>
  );
}

function ResultsSkeleton() {
  return (
    <div className="rounded-lg border bg-card p-4" aria-busy="true" aria-label="Cargando resultados">
      <div className="space-y-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex items-center justify-between gap-6">
            <div className="space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}
