import { useState } from "react";
import type { Car } from "@cars-webscrapper/shared";

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

export default function ResultsTable({ cars }: { cars: Car[] }) {
  const [sort, setSort] = useState<Sort | null>(null);

  if (cars.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--color-line)] bg-[var(--color-surface)]/40 p-10 text-center">
        <p className="text-sm text-[var(--color-ink-muted)]">Esperando el primer anuncio…</p>
      </div>
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
    <div className="overflow-x-auto rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)]">
      <table className="w-full min-w-[560px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-[var(--color-line)] bg-[var(--color-surface-2)]/60 text-xs text-[var(--color-ink-dim)]">
            <th scope="col" className="px-4 py-2.5 font-medium">Auto</th>
            <SortHeader label="Precio" sortKey="priceUsd" sort={sort} onSort={toggleSort} />
            <SortHeader label="Año" sortKey="year" sort={sort} onSort={toggleSort} />
            <SortHeader label="Km" sortKey="km" sort={sort} onSort={toggleSort} />
            <th scope="col" className="px-4 py-2.5 font-medium">Transmisión</th>
            {showColor && <th scope="col" className="px-4 py-2.5 font-medium">Color</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((car) => (
            <CarRow key={car.id} car={car} showColor={showColor} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SortHeader({
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
  return (
    <th scope="col" aria-sort={ariaSort} className="px-4 py-2.5 text-right font-medium">
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="inline-flex items-center gap-1 rounded-sm text-xs font-medium transition-colors hover:text-[var(--color-ink)]"
      >
        {label}
        <SortIcon dir={active} />
      </button>
    </th>
  );
}

function SortIcon({ dir }: { dir: SortDir | null }) {
  const on = "var(--color-accent)";
  const off = "var(--color-ink-muted)";
  return (
    <svg width="10" height="14" viewBox="0 0 10 14" fill="none" aria-hidden="true">
      <path
        d="M2 5.5 5 2.5l3 3"
        stroke={dir === "asc" ? on : off}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M2 8.5l3 3 3-3"
        stroke={dir === "desc" ? on : off}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const money = (n: number) => n.toLocaleString("es-AR", { maximumFractionDigits: 0 });

function CarRow({ car, showColor }: { car: Car; showColor: boolean }) {
  const foreign =
    car.priceOriginal != null && car.currencyOriginal && car.currencyOriginal !== "USD";

  return (
    <tr className="animate-fade-up border-b border-[var(--color-line)]/60 transition-colors last:border-b-0 hover:bg-[var(--color-surface-2)]">
      <td className="max-w-[260px] px-4 py-3">
        <a
          href={car.link}
          target="_blank"
          rel="noreferrer"
          className="block truncate font-medium text-[var(--color-ink)] underline decoration-transparent decoration-1 underline-offset-4 transition-colors hover:text-[var(--color-accent)] hover:decoration-current"
        >
          {car.name}
        </a>
        {car.model && (
          <span className="block truncate text-xs text-[var(--color-ink-muted)]">{car.model}</span>
        )}
      </td>
      <td className="px-4 py-3 text-right font-mono tabular-nums">
        {car.priceUsd != null ? (
          <span className="font-medium text-[var(--color-accent)]">
            ${money(car.priceUsd)}
          </span>
        ) : (
          <span className="text-[var(--color-ink-muted)]">—</span>
        )}
        {foreign && (
          <span className="block text-xs text-[var(--color-ink-muted)]">
            {money(car.priceOriginal!)} {car.currencyOriginal}
          </span>
        )}
      </td>
      <Num value={car.year?.toString()} />
      <Num value={car.km?.toLocaleString("es-AR")} />
      <Text value={car.transmission} />
      {showColor && <Text value={car.color} />}
    </tr>
  );
}

function Num({ value }: { value: string | undefined }) {
  return (
    <td className="px-4 py-3 text-right font-mono tabular-nums text-[var(--color-ink-dim)]">
      {value ?? "—"}
    </td>
  );
}

function Text({ value }: { value: string | null }) {
  return <td className="px-4 py-3 text-[var(--color-ink-dim)]">{value ?? "—"}</td>;
}
