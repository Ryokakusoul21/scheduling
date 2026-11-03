"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Users } from "@phosphor-icons/react/ssr";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { LOAD_STATUS } from "@/components/workload/load-bar";
import type { FacultyLoadView } from "@/lib/workload/view";
import { cn } from "@/lib/utils";
import { LINK_CLASS, QuietState, TONE, type Tone } from "./kit";

type Status = FacultyLoadView["status"];

const ORDER: Record<Status, number> = { OVERLOADED: 0, UNDERLOADED: 1, BALANCED: 2 };
const STATUS_TONE: Record<Status, Tone> = { OVERLOADED: "danger", UNDERLOADED: "warning", BALANCED: "success" };
const FILL: Record<Status, string> = { OVERLOADED: "bg-danger", UNDERLOADED: "bg-warning", BALANCED: "bg-success" };
const STATUSES = Object.keys(ORDER) as Status[];

/** Faculty loads, most critical first: a track with the allowed band shaded and the load drawn on top. */
export function WorkloadChart({ rows, unit, limit = 10 }: { rows: FacultyLoadView[]; unit: string; limit?: number }) {
  const [filter, setFilter] = useState<Status | "ALL">("ALL");
  if (rows.length === 0) return <QuietState icon={Users} title="No active faculty">Loads appear once faculty are assigned to classes in an active term.</QuietState>;

  const sorted = rows.filter((r) => filter === "ALL" || r.status === filter).sort((a, b) => ORDER[a.status] - ORDER[b.status] || b.load - a.load);
  const shown = sorted.slice(0, limit);
  const count = (s: Status) => rows.filter((r) => r.status === s).length;
  const chips: [Status | "ALL", string][] = [["ALL", `All (${rows.length})`], ...STATUSES.map((s): [Status, string] => [s, `${LOAD_STATUS[s].label} (${count(s)})`])];

  return (
    <TooltipProvider>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by load status">
          {chips.map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
              className="flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors duration-150 hover:bg-muted aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background"
            >
              {value !== "ALL" && <span className={cn("size-2 rounded-full", FILL[value])} aria-hidden />}
              {label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground" aria-label="Legend">
          <span className="flex items-center gap-1.5"><span className="h-3 w-5 rounded-sm border-x-2 border-foreground/40 bg-foreground/10" aria-hidden />Allowed range</span>
          <span className="flex items-center gap-1.5"><span className="h-1.5 w-5 rounded-full bg-foreground/70" aria-hidden />Current load</span>
        </div>
      </div>

      <ul className="divide-y">
        {shown.map((r) => (
          <li key={r.facultyId} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 py-2.5 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)_8rem_7.5rem]">
            <span className="order-1 truncate font-medium" title={`${r.name}, ${r.department}`}>{r.name}</span>
            <Tooltip>
              <TooltipTrigger
                render={<div tabIndex={0} className="order-3 col-span-2 rounded-full sm:order-2 sm:col-span-1" />}
                aria-label={`${r.name}: ${r.load} ${unit}, allowed ${r.minimum} to ${r.maximum} ${unit}`}
              >
                <Track r={r} />
              </TooltipTrigger>
              <TooltipContent>
                {r.load} {unit} · allowed {r.minimum}–{r.maximum} {unit}
              </TooltipContent>
            </Tooltip>
            <span className="order-4 text-[13px] tabular-nums text-muted-foreground sm:order-3 sm:text-right">
              {r.load} / {r.minimum}–{r.maximum} {unit}
            </span>
            <StatusPill status={r.status} />
          </li>
        ))}
      </ul>
      {shown.length === 0 && <p className="text-[13px] text-muted-foreground">No faculty in this group.</p>}

      <p className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-muted-foreground">
        Showing {shown.length} of {sorted.length}
        <Link href="/workload" className={LINK_CLASS}>
          View all in Faculty Workload <ArrowRight className="size-3.5" />
        </Link>
      </p>
    </TooltipProvider>
  );
}

/** Status text with an icon, so the state never depends on color alone. */
function StatusPill({ status }: { status: Status }) {
  const S = LOAD_STATUS[status];
  return (
    <span className={cn("order-2 inline-flex w-fit items-center gap-1 justify-self-end rounded-full px-2 py-0.5 text-xs font-medium sm:order-4", TONE[STATUS_TONE[status]])}>
      <S.icon className="size-3.5" /> {S.label}
    </span>
  );
}

/** One track: neutral band for the allowed range, status-colored load bar with an end marker on top. */
function Track({ r }: { r: FacultyLoadView }) {
  const scale = Math.max(r.maximum * 1.25, r.load, 1);
  const pct = (n: number) => Math.min((n / scale) * 100, 100);
  return (
    <div className="relative h-4 w-full rounded-full bg-muted" aria-hidden>
      <div className="absolute inset-y-0 border-x-2 border-foreground/40 bg-foreground/10" style={{ left: `${pct(r.minimum)}%`, width: `${pct(r.maximum) - pct(r.minimum)}%` }} />
      <div className={cn("absolute top-1/2 left-0 h-2 -translate-y-1/2 rounded-full", FILL[r.status])} style={{ width: `${pct(r.load)}%` }} />
      <div className={cn("absolute inset-y-0 w-1 -translate-x-1/2 rounded-full ring-2 ring-card", FILL[r.status])} style={{ left: `${pct(r.load)}%` }} />
    </div>
  );
}
