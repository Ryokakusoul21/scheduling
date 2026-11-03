"use client";

import { useState } from "react";
import { CaretUpDown, Check } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type ScheduleOption = { id: string; code: string; section: string; day: string; time: string; room: string; faculty: string };

const text = (o: ScheduleOption) => `${o.code} · ${o.section} · ${o.day} ${o.time} · Room ${o.room}`;

/** Searchable list of classes showing subject code, section, day, time and room. */
export function ScheduleCombobox({
  id,
  options,
  value,
  onChange,
  disabled,
  invalid,
  describedBy,
}: {
  id?: string;
  options: ScheduleOption[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
}) {
  const [open, setOpen] = useState(false);
  const chosen = options.find((o) => o.id === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-invalid={invalid}
            aria-describedby={describedBy}
            disabled={disabled}
            className="h-10 w-full justify-between font-normal"
          />
        }
      >
        <span className={cn("truncate", !chosen && "text-muted-foreground")}>{chosen ? text(chosen) : disabled ? "Not needed for a new schedule" : "Search and choose a class"}</span>
        <CaretUpDown className="size-4 shrink-0 opacity-60" aria-hidden />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(32rem,calc(100vw-2rem))] p-0">
        <Command>
          <CommandInput placeholder="Search subject, section, day, or room" />
          <CommandList>
            <CommandEmpty>No class matches that search.</CommandEmpty>
            {options.map((o) => (
              <CommandItem key={o.id} value={`${text(o)} ${o.faculty}`} onSelect={() => { onChange(o.id); setOpen(false); }}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{o.code} · {o.section}</span>
                  <span className="block truncate text-sm text-muted-foreground">{o.day} {o.time} · Room {o.room} · {o.faculty}</span>
                </span>
                {o.id === value && <Check className="size-4" aria-hidden />}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
