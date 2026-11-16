import { useState } from "react";
import { LoaderCircle, Search } from "lucide-react";
import type { Catalog, SearchFilters } from "@cars-webscrapper/shared";
import { EMPTY_FORM, formError, formToFilters, type SearchForm as FormState } from "../lib/searchForm.js";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Combobox from "./Combobox.js";

const COLORS = [
  "blanco",
  "negro",
  "gris",
  "plata",
  "rojo",
  "azul",
  "verde",
  "amarillo",
  "naranja",
  "marrón",
  "beige",
  "bordó",
];

const TRANSMISSION_LABELS: Record<FormState["transmission"], string> = {
  any: "",
  manual: "Manual",
  automatic: "Automática",
};

interface Props {
  catalog: Catalog | null;
  running: boolean;
  onSubmit: (filters: SearchFilters) => void;
}

export default function SearchForm({ catalog, running, onSubmit }: Props) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const error = formError(form);
  const models = catalog?.brands.find((b) => b.name === form.brand)?.models ?? [];

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  // A color is either included or excluded, never both
  function toggleColor(key: "includeColors" | "excludeColors", color: string, checked: boolean) {
    const other = key === "includeColors" ? "excludeColors" : "includeColors";
    setForm((prev) => ({
      ...prev,
      [key]: checked ? [...prev[key], color] : prev[key].filter((c) => c !== color),
      [other]: prev[other].filter((c) => c !== color),
    }));
  }

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (!error && !running) onSubmit(formToFilters(form));
      }}
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Marca" htmlFor="brand">
          <Combobox
            id="brand"
            value={form.brand}
            options={catalog?.brands.map((b) => b.name) ?? []}
            disabled={running || catalog === null}
            anyLabel="Cualquiera"
            searchPlaceholder="Buscar marca…"
            emptyText="No hay marcas con ese nombre."
            onChange={(brand) => setForm((prev) => ({ ...prev, brand, model: "" }))}
          />
        </Field>
        <Field label="Modelo" htmlFor="model">
          <Combobox
            id="model"
            value={form.model}
            options={models.map((m) => m.name)}
            disabled={running || form.brand === ""}
            anyLabel={form.brand === "" ? "Elige una marca primero" : "Cualquiera"}
            searchPlaceholder="Buscar modelo…"
            emptyText="No hay modelos con ese nombre."
            onChange={(model) => set("model", model)}
          />
        </Field>

        <RangeField
          label="Precio (USD)"
          id="price"
          min={form.minPrice}
          max={form.maxPrice}
          disabled={running}
          onMin={(v) => set("minPrice", v)}
          onMax={(v) => set("maxPrice", v)}
        />
        <RangeField
          label="Kilometraje"
          id="km"
          min={form.minKm}
          max={form.maxKm}
          disabled={running}
          onMin={(v) => set("minKm", v)}
          onMax={(v) => set("maxKm", v)}
        />
        <RangeField
          label="Año"
          id="year"
          min={form.minYear}
          max={form.maxYear}
          disabled={running}
          onMin={(v) => set("minYear", v)}
          onMax={(v) => set("maxYear", v)}
        />
        <Field label="Transmisión" htmlFor="transmission">
          <Combobox
            id="transmission"
            value={TRANSMISSION_LABELS[form.transmission]}
            options={["Manual", "Automática"]}
            disabled={running}
            anyLabel="Cualquiera"
            searchPlaceholder="Buscar transmisión…"
            emptyText="No hay opciones."
            onChange={(label) =>
              set("transmission", label === "Manual" ? "manual" : label === "Automática" ? "automatic" : "any")
            }
          />
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <ColorGroup
          legend="Incluir colores"
          name="include"
          selected={form.includeColors}
          disabled={running}
          onToggle={(color, checked) => toggleColor("includeColors", color, checked)}
        />
        <ColorGroup
          legend="Excluir colores"
          name="exclude"
          selected={form.excludeColors}
          disabled={running}
          onToggle={(color, checked) => toggleColor("excludeColors", color, checked)}
        />
      </div>

      <div className="flex items-center justify-between gap-4">
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
        <Button size="lg" type="submit" disabled={error !== null || running}>
          {running ? (
            <>
              <LoaderCircle className="animate-spin" aria-hidden="true" data-icon="inline-start" />
              En ejecución…
            </>
          ) : (
            <>
              <Search aria-hidden="true" data-icon="inline-start" />
              Buscar en todos los sitios
            </>
          )}
        </Button>
      </div>
    </form>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

function RangeField(props: {
  label: string;
  id: string;
  min: string;
  max: string;
  disabled: boolean;
  onMin: (value: string) => void;
  onMax: (value: string) => void;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{props.label}</legend>
      <div className="grid grid-cols-2 gap-2">
        <Input
          id={`${props.id}-min`}
          aria-label={`${props.label}, mínimo`}
          type="number"
          inputMode="numeric"
          min={0}
          placeholder="Mínimo"
          value={props.min}
          disabled={props.disabled}
          onChange={(e) => props.onMin(e.target.value)}
        />
        <Input
          id={`${props.id}-max`}
          aria-label={`${props.label}, máximo`}
          type="number"
          inputMode="numeric"
          min={0}
          placeholder="Máximo"
          value={props.max}
          disabled={props.disabled}
          onChange={(e) => props.onMax(e.target.value)}
        />
      </div>
    </fieldset>
  );
}

function ColorGroup(props: {
  legend: string;
  name: string;
  selected: string[];
  disabled: boolean;
  onToggle: (color: string, checked: boolean) => void;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{props.legend}</legend>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {COLORS.map((color) => {
          const id = `${props.name}-${color}`;
          return (
            <div key={color} className="flex items-center gap-2">
              <Checkbox
                id={id}
                checked={props.selected.includes(color)}
                disabled={props.disabled}
                onCheckedChange={(checked) => props.onToggle(color, checked === true)}
              />
              <Label htmlFor={id} className="text-sm font-normal capitalize">
                {color}
              </Label>
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}
