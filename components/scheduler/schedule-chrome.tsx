"use client";

import type { Ref } from "react";
import { CaretDoubleLeft, CaretDoubleRight, CaretDown, FunnelSimple, Info, X } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Field, FieldLabel } from "@/components/ui/field";
import { NativeSelect } from "@/components/ux/native-select";
import { cn } from "@/lib/utils";

export type Perspective = "section" | "faculty" | "room";

/** One compact toolbar shared by the class and examination schedules; year and term stay visible. */
export function ScheduleHeader({ leading, trail, help, modes, children }: { leading?: React.ReactNode; trail: React.ReactNode; help: string; modes?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex shrink-0 flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">{trail}</span>
        <h1 className="sr-only">Scheduler</h1>
        <button type="button" aria-label="Scheduler help" title={help} className="rounded-full text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"><Info className="size-4" /></button>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2 rounded-xl border bg-card p-2 shadow-xs">
        {modes}
        {leading && <div className="flex max-w-full shrink-0 items-center divide-x rounded-md border bg-background pr-1 shadow-xs [&_select]:h-8 [&_select]:rounded-none [&_select]:border-0 [&_select]:bg-transparent [&_select]:shadow-none">{leading}</div>}
        <div className="flex w-full min-w-0 flex-wrap items-center gap-2 xl:w-auto xl:flex-1 xl:justify-end">{children}</div>
      </div>
    </div>
  );
}

/** Slim filter bar: the fields open in a popover, active filters show as removable chips, and the View By toggle stays inline. */
export function FilterCard({ expanded, onToggle, activeCount, chips, perspective, onPerspective, filterRef, children }: { expanded: boolean; onToggle: () => void; activeCount: number; chips?: { key: string; label: string; onClear: () => void }[]; perspective?: Perspective; onPerspective?: (p: Perspective) => void; filterRef?: Ref<HTMLDivElement>; children: React.ReactNode }) {
  return (
    <div ref={filterRef} className="flex shrink-0 flex-wrap items-center gap-2">
      <Popover open={expanded} onOpenChange={(open) => { if (open !== expanded) onToggle(); }}>
        <PopoverTrigger render={<Button variant="outline" size="sm" />}>
          <FunnelSimple className="size-4" /> Filters {activeCount > 0 && <Badge variant="secondary">{activeCount}</Badge>}
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[min(92vw,44rem)] p-3">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,11rem),1fr))] gap-2 [&>*]:min-w-0">{children}</div>
        </PopoverContent>
      </Popover>
      {chips?.map((chip) => <button key={chip.key} type="button" onClick={chip.onClear} aria-label={`Clear ${chip.label}`} className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium outline-none hover:bg-secondary/70 focus-visible:ring-2 focus-visible:ring-ring">{chip.label} <X className="size-3" /></button>)}
      {perspective && onPerspective && <div className="ml-auto flex items-center gap-1" role="radiogroup" aria-label="View by">
        <span className="mr-1 text-xs font-medium text-muted-foreground">View by</span>
        {(["section", "faculty", "room"] as const).map((kind) => <button key={kind} type="button" role="radio" aria-checked={perspective === kind} onClick={() => onPerspective(kind)} className={cn("rounded-md px-2 py-1 text-xs font-medium capitalize outline-none focus-visible:ring-2 focus-visible:ring-ring", perspective === kind ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>{kind}</button>)}
      </div>}
    </div>
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

/** One collapsible block of the scheduler side panel; collapsed content stays mounted so its counts keep updating. */
export function PanelSection({ id, title, count, tone = "secondary", open, onToggle, children }: { id: string; title: string; count?: number | null; tone?: "secondary" | "outline" | "destructive"; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <section data-panel={id} className="rounded-lg border bg-card">
      <button type="button" onClick={onToggle} aria-expanded={open} aria-controls={`panel-${id}`} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring">
        <CaretDown className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", !open && "-rotate-90")} />
        <span className="flex-1">{title}</span>
        {count != null && <Badge variant={tone}>{count}</Badge>}
      </button>
      <div id={`panel-${id}`} hidden={!open} className="border-t p-2">{children}</div>
    </section>
  );
}

/** Heading of the schedule checks panel with the total and the hide button. */
export function ChecksHeading({ total, conflicts, onHide }: { total: number; conflicts: number; onHide: () => void }) {
  return (
    <div className="flex items-center gap-2 px-1">
      <span className="flex-1 text-sm font-semibold">Schedule checks</span>
      {total > 0 && <Badge variant={conflicts ? "destructive" : "outline"}>{total}</Badge>}
      <Button variant="ghost" size="icon-sm" className="hidden lg:inline-flex" onClick={onHide} aria-label="Hide schedule checks" title="Hide schedule checks">
        <CaretDoubleRight className="size-4" />
      </Button>
    </div>
  );
}

/** Slim rail shown in place of the hidden checks panel; keeps the counts in view and reopens it. */
export function ChecksRail({ total, conflicts, onShow }: { total: number; conflicts: number; onShow: () => void }) {
  return (
    <button type="button" onClick={onShow} aria-label={`Show schedule checks, ${total} issues`} title="Show schedule checks" className="flex h-full min-h-48 w-full flex-col items-center gap-3 rounded-xl border bg-card py-3 text-muted-foreground shadow-xs outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
      <CaretDoubleLeft className="size-4" />
      {conflicts > 0 && <Badge variant="destructive" title="Conflicts">{conflicts}</Badge>}
      {total - conflicts > 0 && <Badge variant="outline" title="Other issues">{total - conflicts}</Badge>}
      <span className="text-xs font-medium [writing-mode:vertical-rl]">Schedule checks</span>
    </button>
  );
}
