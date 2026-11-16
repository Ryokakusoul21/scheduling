"use client";

import type { Icon } from "@phosphor-icons/react";
import { CheckCircle } from "@phosphor-icons/react/ssr";
import { DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export const LEGEND = "mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase";

/** Dialog header with a tinted icon beside the title and a one-line description. */
export function DialogHero({ icon: Glyph, title, description }: { icon: Icon; title: string; description: string }) {
  return (
    <DialogHeader className="flex-row items-center gap-3 pr-8">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Glyph className="size-5" weight="duotone" aria-hidden /></span>
      <div className="min-w-0 space-y-1.5">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </div>
    </DialogHeader>
  );
}

/** Radio group drawn as a segmented control; each option may carry a count. */
export function Segmented<T extends string>({ name, legend, value, options, onChange, disabled }: {
  name: string;
  legend: string;
  value: T;
  options: { value: T; label: string; count?: number }[];
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset disabled={disabled}>
      <legend className={LEGEND}>{legend}</legend>
      <div className="grid gap-1 rounded-lg bg-muted p-1 sm:auto-cols-fr sm:grid-flow-col">
        {options.map((o) => (
          <label key={o.value} className={cn("flex min-h-9 min-w-0 cursor-pointer items-center justify-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors has-focus-visible:ring-2 has-focus-visible:ring-ring", value === o.value ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground")}>
            <input type="radio" name={name} className="sr-only" checked={value === o.value} onChange={() => onChange(o.value)} />
            <span className="truncate">{o.label}</span>
            {o.count !== undefined && <span className="rounded-full bg-primary/10 px-1.5 text-xs text-primary tabular-nums">{o.count}</span>}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Checkbox drawn as a card: icon, short label, optional one-line hint, and a tick when on. */
export function ToggleCard({ icon: Glyph, label, hint, checked, onChange }: { icon: Icon; label: string; hint?: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className={cn("flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors has-focus-visible:ring-2 has-focus-visible:ring-ring", checked ? "border-primary/50 bg-primary/5" : "hover:bg-muted/50")}>
      <input type="checkbox" className="sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors", checked ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}><Glyph className="size-4" aria-hidden /></span>
      <span className="min-w-0 flex-1 text-sm font-medium">
        {label}
        {hint && <span className="block text-xs font-normal text-muted-foreground">{hint}</span>}
      </span>
      <CheckCircle weight="fill" aria-hidden className={cn("size-5 shrink-0 text-primary", !checked && "invisible")} />
    </label>
  );
}

/** Small pill for one fact, with an icon. */
export function Fact({ icon: Glyph, children }: { icon: Icon; children: React.ReactNode }) {
  return <span className="inline-flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 text-xs text-muted-foreground"><Glyph className="size-3.5 shrink-0" aria-hidden />{children}</span>;
}
