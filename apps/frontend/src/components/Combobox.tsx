import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface Props {
  id: string;
  /** "" means no selection */
  value: string;
  options: string[];
  onChange: (value: string) => void;
  /** Text of the "no selection" option and of the closed button when nothing is chosen */
  anyLabel: string;
  searchPlaceholder: string;
  emptyText: string;
  disabled?: boolean;
}

// shadcn combobox: a button that opens a searchable list
export default function Combobox({
  id,
  value,
  options,
  onChange,
  anyLabel,
  searchPlaceholder,
  emptyText,
  disabled = false,
}: Props) {
  const [open, setOpen] = useState(false);

  function choose(next: string) {
    onChange(next);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          <span className={cn("truncate", value === "" && "text-muted-foreground")}>{value || anyLabel}</span>
          <ChevronsUpDown aria-hidden="true" className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              <ComboItem label={anyLabel} selected={value === ""} onSelect={() => choose("")} />
              {options.map((option) => (
                <ComboItem key={option} label={option} selected={value === option} onSelect={() => choose(option)} />
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function ComboItem({ label, selected, onSelect }: { label: string; selected: boolean; onSelect: () => void }) {
  return (
    <CommandItem value={label} onSelect={onSelect}>
      <Check aria-hidden="true" className={cn("size-4", selected ? "opacity-100" : "opacity-0")} />
      {label}
    </CommandItem>
  );
}
