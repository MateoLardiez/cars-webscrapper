import type { Car } from "@cars-webscrapper/shared";

export default function ResultsTable({ cars }: { cars: Car[] }) {
  if (cars.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--color-line)] bg-[var(--color-surface)]/40 p-10 text-center">
        <p className="font-mono text-xs uppercase tracking-[0.25em] text-[var(--color-ink-muted)]">
          Esperando primer anuncio
        </p>
      </div>
    );
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {cars.map((car, i) => (
        <CarCard key={car.id} car={car} index={i} />
      ))}
    </div>
  );
}

function CarCard({ car, index }: { car: Car; index: number }) {
  return (
    <article
      className="group animate-fade-up rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-4 transition-all hover:border-[var(--color-amber)]/50 hover:bg-[var(--color-surface-2)]"
      style={{ animationDelay: `${index * 40}ms` }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-serif text-xl italic leading-tight text-[var(--color-ink)]">
            {car.name}
          </h3>
          {car.model && (
            <p className="mt-0.5 font-mono text-xs text-[var(--color-ink-muted)]">
              {car.model}
            </p>
          )}
        </div>
        {car.priceUsd != null && (
          <div className="shrink-0 text-right">
            <p className="font-mono text-lg font-medium text-[var(--color-amber)]">
              ${car.priceUsd.toLocaleString()}
            </p>
            {car.priceOriginal && car.currencyOriginal && car.currencyOriginal !== "USD" && (
              <p className="font-mono text-[10px] text-[var(--color-ink-muted)]">
                {car.priceOriginal.toLocaleString()} {car.currencyOriginal}
              </p>
            )}
          </div>
        )}
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-[var(--color-line)]/60 pt-3 font-mono text-[11px]">
        <Spec label="Año" value={car.year} />
        <Spec label="Km" value={car.km?.toLocaleString()} />
        <Spec label="Trans" value={car.transmission} />
        <Spec label="Color" value={car.color} />
        <Spec label="Guardado" value={new Date(car.savedAt).toLocaleTimeString()} />
        <div className="col-start-3 row-start-1 row-span-2 flex items-end justify-end">
          <a
            href={car.link}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--color-ink-dim)] underline decoration-[var(--color-amber)]/50 decoration-1 underline-offset-4 transition-colors hover:text-[var(--color-amber)]"
          >
            Ver →
          </a>
        </div>
      </dl>
    </article>
  );
}

function Spec({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div>
      <dt className="text-[9px] uppercase tracking-[0.2em] text-[var(--color-ink-muted)]">{label}</dt>
      <dd className="text-[var(--color-ink-dim)]">{value ?? "—"}</dd>
    </div>
  );
}
