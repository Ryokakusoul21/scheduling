"use client";

import type { Ref } from "react";
import { CaretDoubleLeft, CaretDoubleRight, CaretDown, CaretUp, FunnelSimple, Info } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { NativeSelect } from "@/components/ux/native-select";
import { cn } from "@/lib/utils";

export type Perspective = "section" | "faculty" | "room";

/** Header bar shared by the class and examination schedules; the caller supplies the leading controls and the actions. */
export function ScheduleHeader({ leading, trail, help, modes, children }: { leading?: React.ReactNode; trail: React.ReactNode; help: string; modes?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex shrink-0 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">{trail}</span>
        <h1 className="text-lg font-semibold tracking-tight">Scheduler</h1>
        <button type="button" aria-label="Scheduler help" title={help} className="rounded-full text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"><Info className="size-4" /></button>
      </div>
      {modes}
      <div className="flex min-w-0 flex-col gap-3 rounded-xl border bg-card p-3 shadow-xs xl:flex-row xl:flex-wrap xl:items-end">
        {leading && <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:flex xl:flex-wrap xl:items-end [&>*]:min-w-0">{leading}</div>}
        <div className="grid min-w-0 gap-2 sm:flex sm:flex-wrap xl:flex-1 xl:justify-end [&>button]:h-auto [&>button]:min-h-11 [&>button]:whitespace-normal [&>button]:py-2 sm:[&>button]:min-h-9">{children}</div>
      </div>
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
        {toggleable && <div className="flex flex-wrap items-center gap-2">
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
        {(expanded || !toggleable) && <div className={cn(toggleable && "mt-2", "grid grid-cols-[repeat(auto-fit,minmax(min(100%,11rem),1fr))] gap-2 [&>*]:min-w-0")}>{children}</div>}
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
