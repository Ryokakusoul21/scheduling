"use client";

import { useEffect, useState } from "react";
import { WarningCircle } from "@phosphor-icons/react/ssr";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CONFLICT_LABELS, collapseLanes, formatLongDate } from "@/lib/calendar";
import { formatRange, formatTime } from "@/lib/scheduler/timetable";
import { cn } from "@/lib/utils";
import { CONFLICT_STRIPES, ConflictTag } from "@/components/ux/conflict";
import type { CalendarEvent } from "./calendar-board";

export const DAY_START = 7 * 60;
export const DAY_END = 21 * 60;
/** Default end of the visible day; "Expand hours" shows up to DAY_END. */
export const WORK_END = 18 * 60;
const HOUR_PX = 48;
const LINE_PX = 15;

export const PENDING_STYLE = "border-2 border-dashed italic opacity-70";
export const isAllDay = (e: CalendarEvent) => e.startMin === null || e.endMin === null;
export const onDate = (e: CalendarEvent, d: string) => e.date <= d && e.endDate >= d;

export type Conflicts = Map<string, Set<keyof typeof CONFLICT_LABELS>>;

/** "Conflict: same room, same section" for a flagged event. */
export const conflictText = (why: Set<keyof typeof CONFLICT_LABELS>) => `Conflict: ${[...why].map((w) => CONFLICT_LABELS[w]).join(", ")}`;

/** Compact all-day or month cell item. */
export function Chip({ e, color, onSelect, className }: { e: CalendarEvent; color: string; onSelect: (e: CalendarEvent) => void; className?: string }) {
  return (
    <button onClick={() => onSelect(e)} className={cn("block w-full truncate rounded border px-1.5 py-0.5 text-left text-xs leading-tight", color, e.badge && "border-dashed", e.pending && PENDING_STYLE, className)} title={e.title}>
      {!isAllDay(e) && <span className="mr-1 font-medium">{formatTime(e.startMin!)}</span>}
      {e.title}
    </button>
  );
}

/** Current minute of the day in Manila, set only after mount to avoid a hydration mismatch. */
function useNowMinute() {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => {
      const [h, m] = new Date().toLocaleTimeString("en-GB", { timeZone: "Asia/Manila", hour: "2-digit", minute: "2-digit" }).split(":").map(Number);
      setNow(h * 60 + m);
    };
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export function TimeGrid({ dates, today, events, dayEnd, colorOf, conflicts, onSelect, onDay, onMore }: {
  dates: string[];
  today: string;
  events: CalendarEvent[];
  dayEnd: number;
  colorOf: (e: CalendarEvent) => string;
  conflicts: Conflicts;
  onSelect: (e: CalendarEvent) => void;
  onDay: (d: string) => void;
  onMore: (events: CalendarEvent[], label: string) => void;
}) {
  const now = useNowMinute();
  const hours = Array.from({ length: (dayEnd - DAY_START) / 60 }, (_, i) => DAY_START + i * 60);
  const height = ((dayEnd - DAY_START) / 60) * HOUR_PX;
  const y = (min: number) => ((Math.min(Math.max(min, DAY_START), dayEnd) - DAY_START) / 60) * HOUR_PX;
  const single = dates.length === 1;
  // At most this many items side by side so each keeps a readable width; the rest fold into a "+N more" block.
  const maxLanes = single ? 6 : 2;

  return (
    <div className="max-h-[75vh] overflow-auto rounded-xl border bg-card">
      <div className={cn("grid", single ? "min-w-[360px]" : "min-w-[1100px]")} style={{ gridTemplateColumns: `56px repeat(${dates.length}, minmax(0, 1fr))` }}>
        <div className="sticky top-0 z-20 border-b bg-card" />
        {dates.map((d) => (
          <button key={d} onClick={() => onDay(d)} aria-label={`Open ${formatLongDate(d)}`} className={cn("sticky top-0 z-20 flex items-center gap-2 border-b border-l bg-card px-3 py-2 text-left outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring", d === today && "bg-primary/5")}>
            <span className={cn("flex size-8 items-center justify-center rounded-full text-base font-semibold tabular-nums", d === today ? "bg-primary text-primary-foreground" : "bg-muted")}>{Number(d.slice(8))}</span>
            <span className="leading-tight">
              <span className={cn("block text-xs font-semibold uppercase tracking-wide", d === today ? "text-primary" : "text-muted-foreground")}>{formatLongDate(d, { weekday: "short" })}</span>
              <span className="block text-xs text-muted-foreground">{formatLongDate(d, { month: "short" })}{d === today && " · Today"}</span>
            </span>
          </button>
        ))}
        <div className="border-b px-1 py-1 text-right text-[11px] text-muted-foreground">All day</div>
        {dates.map((d) => (
          <div key={d} className={cn("min-h-8 space-y-0.5 border-b border-l p-1", d === today && "bg-primary/[0.06]")}>
            {events.filter((e) => onDate(e, d) && isAllDay(e)).map((e) => <Chip key={e.id} e={e} color={colorOf(e)} onSelect={onSelect} />)}
          </div>
        ))}
        <div className="relative" style={{ height }}>
          {hours.map((h) => <span key={h} className="absolute right-2 -translate-y-1/2 text-[11px] text-muted-foreground" style={{ top: y(h) }}>{formatTime(h)}</span>)}
        </div>
        {dates.map((d) => {
          const timed = events.filter((e) => onDate(e, d) && !isAllDay(e));
          const { shown, overflow } = collapseLanes(timed.map((e) => ({ id: e.id, startMin: e.startMin!, endMin: e.endMin! })), maxLanes);
          const dayLabel = formatLongDate(d, { weekday: "short", month: "short", day: "numeric" });
          return (
            <div key={d} className={cn("relative border-l", d === today && "bg-primary/[0.06]")} style={{ height }}>
              {hours.map((h) => <div key={h} className="absolute inset-x-0 border-t border-border/70" style={{ top: y(h) }} />)}
              {timed.map((e) => {
                const l = shown.get(e.id);
                if (!l) return null;
                return <EventCell key={e.id} e={e} color={colorOf(e)} conflict={conflicts.get(e.id)} single={single} top={y(e.startMin!)} height={Math.max(y(e.endMin!) - y(e.startMin!), 18)} lane={l} onSelect={onSelect} />;
              })}
              {overflow.map((o) => {
                const hidden = timed.filter((e) => o.ids.includes(e.id));
                const clash = hidden.some((e) => conflicts.has(e.id));
                return (
                  <button
                    key={o.ids.join()}
                    onClick={() => onMore(hidden, `${dayLabel}, ${formatRange(o.startMin, o.endMin)}`)}
                    className={cn("absolute flex items-center justify-center gap-0.5 overflow-hidden rounded-md border border-dashed border-muted-foreground/40 bg-muted/70 px-1 py-0.5 text-xs font-semibold text-muted-foreground hover:bg-accent hover:text-foreground", clash && "border-l-4 border-l-red-600")}
                    style={{ top: y(o.startMin), height: Math.max(y(o.endMin) - y(o.startMin), 18), left: `${(o.lane / o.lanes) * 100}%`, width: `${100 / o.lanes}%` }}
                    aria-label={`Show ${o.ids.length} more items${clash ? ", including conflicts" : ""}`}
                  >
                    {clash && <WarningCircle weight="fill" className="size-3.5 shrink-0 text-red-600" />}+{o.ids.length} more
                  </button>
                );
              })}
              {d === today && now !== null && now >= DAY_START && now <= dayEnd && (
                <div className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-red-500" style={{ top: y(now) }} aria-hidden>
                  <span className="absolute -top-[5px] -left-[5px] size-2 rounded-full bg-red-500" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Timed block: subject code first, then room and section as height allows; hover for everything. */
function EventCell({ e, color, conflict, single, top, height, lane, onSelect }: {
  e: CalendarEvent;
  color: string;
  conflict?: Set<keyof typeof CONFLICT_LABELS>;
  single: boolean;
  top: number;
  height: number;
  lane: { lane: number; lanes: number };
  onSelect: (e: CalendarEvent) => void;
}) {
  const info = e.info;
  const lines = [info?.room, info?.section, single ? formatRange(e.startMin!, e.endMin!) : null].filter(Boolean) as string[];
  const fit = Math.max(0, Math.floor((height - 4) / LINE_PX) - 1 - (e.badge ? 1 : 0));
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            onClick={() => onSelect(e)}
            aria-label={`${e.title}, ${formatRange(e.startMin!, e.endMin!)}${conflict ? `. ${conflictText(conflict)}` : ""}`}
            className={cn("absolute overflow-hidden rounded-md border-0 border-l-4 px-1.5 py-0.5 text-left text-xs leading-[15px] ring-1 ring-card", color, e.badge && "border-dashed", e.pending && PENDING_STYLE, conflict && "border-l-red-600 ring-2 ring-red-500/70")}
            style={{ top, height, left: `${(lane.lane / lane.lanes) * 100}%`, width: `${100 / lane.lanes}%`, ...(conflict && { backgroundImage: CONFLICT_STRIPES }) }}
          />
        }
      >
        <span className="flex items-center gap-0.5 truncate font-semibold">
          <span className="truncate">{info?.code ?? e.title}</span>
          {conflict && <ConflictTag className="ml-auto" />}
        </span>
        {lines.slice(0, fit).map((t) => <span key={t} className="block truncate opacity-90">{t}</span>)}
        {e.badge && height >= 2 * LINE_PX + 4 &&<span className="block truncate font-semibold">{e.badge}</span>}
      </TooltipTrigger>
      <TooltipContent className="flex-col items-start gap-0.5 text-left">
        <span className="font-semibold">{info?.subject && info.code ? `${info.code} ${info.subject}` : e.title}</span>
        <span>{formatRange(e.startMin!, e.endMin!)}</span>
        {info?.room && <span>Room: {info.room}</span>}
        {info?.section && <span>Section: {info.section}</span>}
        {info?.faculty && <span>{e.type === "EXAMINATION" ? "Proctor" : e.type === "BOOKING" ? "Booked by" : "Faculty"}: {info.faculty}</span>}
        {e.badge && <span>Status: {e.badge}</span>}
        {conflict && <span className="font-semibold text-red-300 dark:text-red-700">{conflictText(conflict)}</span>}
      </TooltipContent>
    </Tooltip>
  );
}
