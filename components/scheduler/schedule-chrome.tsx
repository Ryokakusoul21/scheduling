"use client";

import type { Ref } from "react";
import { CaretDown, CaretUp, FunnelSimple, Info } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { NativeSelect } from "@/components/ux/native-select";
import { cn } from "@/lib/utils";

export type Perspective = "section" | "faculty" | "room";

/** Header bar shared by the class and examination schedules; the caller supplies the leading controls and the actions. */
export function ScheduleHeader({ leading, trail, help, children }: { leading?: React.ReactNode; trail: string; help: string; children: React.ReactNode }) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 rounded-xl border bg-card px-3 py-2 shadow-xs">
      <div className="flex shrink-0 items-center gap-2">
        {leading}
        <span className="hidden text-xs text-muted-foreground xl:inline">{trail}</span>
        <h1 className="text-lg font-semibold tracking-tight">Scheduler</h1>
        <button type="button" aria-label="Scheduler help" title={help} className="rounded-full text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"><Info className="size-4" /></button>
      </div>
      <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">{children}</div>
    </div>
  );
}

/** Collapsible filter card with the View By toggle; the caller supplies the filter fields. */
export function FilterCard({ expanded, onToggle, activeCount, perspective, onPerspective, filterRef, children }: { expanded: boolean; onToggle: () => void; activeCount: number; perspective?: Perspective; onPerspective?: (p: Perspective) => void; filterRef?: Ref<HTMLDivElement>; children: React.ReactNode }) {
  // Without View By there is nothing to collapse, so the fields show on their own.
  const toggleable = !!(perspective && onPerspective);
  return (
    <Card className="shrink-0">
      <CardContent ref={filterRef} className="p-2.5">
        {toggleable && <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onToggle} aria-expanded={expanded}>
            <FunnelSimple className="size-4" /> {expanded ? "Collapse Filters" : "Expand Filters"}
            {!expanded && <Badge variant="secondary">{activeCount}</Badge>}
            {expanded ? <CaretUp className="size-3.5" /> : <CaretDown className="size-3.5" />}
          </Button>
          {perspective && onPerspective && <div className="ml-auto flex items-center gap-1" role="radiogroup" aria-label="View by">
            <span className="mr-1 text-xs font-medium text-muted-foreground">View By:</span>
            {(["section", "faculty", "room"] as const).map((kind) => <button key={kind} type="button" role="radio" aria-checked={perspective === kind} onClick={() => onPerspective(kind)} className={cn("rounded-md px-2 py-1 text-xs font-medium capitalize outline-none focus-visible:ring-2 focus-visible:ring-ring", perspective === kind ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>{kind}</button>)}
          </div>}
        </div>}
        {(expanded || !toggleable) && <div className={cn(toggleable && "mt-2", "grid grid-cols-[repeat(auto-fit,minmax(11rem,1fr))] gap-2")}>{children}</div>}
      </CardContent>
    </Card>
  );
}

export function FilterSelect({ label, value, onChange, options, placeholder }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string; title?: string }[]; placeholder?: string }) {
  const id = `filter-${label.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <Field className="gap-1">
      <FieldLabel htmlFor={id} className="text-xs text-muted-foreground">{label}</FieldLabel>
      <NativeSelect id={id} value={value} title={options.find((option) => option.value === value)?.title} onChange={(e) => onChange(e.target.value)} options={options} placeholder={placeholder} />
    </Field>
  );
}

export function ViewToggle({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: React.ComponentType<{ className?: string }>; label: string }) {
  return (
    <button type="button" role="radio" aria-checked={active} onClick={onClick} className={cn("inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium transition-colors", active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
      <Icon className="size-4" /> {label}
    </button>
  );
}

export function PanelTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" role="tab" aria-selected={active} onClick={onClick} className={cn("inline-flex h-8 items-center justify-center gap-1 whitespace-nowrap rounded-md px-1 text-xs font-medium transition-colors", active ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground")}>
      {children}
    </button>
  );
}
