"use client";

import { memo, useEffect, useMemo, useRef } from "react";
import { useDndContext, useDraggable, useDroppable } from "@dnd-kit/core";
import { Warning, WarningOctagon } from "@phosphor-icons/react/ssr";
import { cn } from "@/lib/utils";
import {
  DAY_LONG,
  DEFAULT_GRID,
  formatRange,
  formatTime,
  gridHeight,
  layoutLanes,
  minutesToY,
  type GridConfig,
  type Severity,
} from "@/lib/scheduler/timetable";
import type { DayOfWeek } from "@/lib/scheduler/types";
import type { SchedulerEntry } from "./types";

export const PALETTE = [
  "bg-blue-50 text-blue-950 border-blue-300 dark:bg-blue-500/15 dark:text-blue-100 dark:border-blue-400/40",
  "bg-emerald-50 text-emerald-950 border-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-100 dark:border-emerald-400/40",
  "bg-violet-50 text-violet-950 border-violet-300 dark:bg-violet-500/15 dark:text-violet-100 dark:border-violet-400/40",
  "bg-amber-50 text-amber-950 border-amber-300 dark:bg-amber-500/15 dark:text-amber-100 dark:border-amber-400/40",
  "bg-cyan-50 text-cyan-950 border-cyan-300 dark:bg-cyan-500/15 dark:text-cyan-100 dark:border-cyan-400/40",
  "bg-pink-50 text-pink-950 border-pink-300 dark:bg-pink-500/15 dark:text-pink-100 dark:border-pink-400/40",
  "bg-lime-50 text-lime-950 border-lime-300 dark:bg-lime-500/15 dark:text-lime-100 dark:border-lime-400/40",
  "bg-orange-50 text-orange-950 border-orange-300 dark:bg-orange-500/15 dark:text-orange-100 dark:border-orange-400/40",
];

export interface BlockInfo {
  title: string; // subject code
  subtitle: string; // subject name
  lines: string[]; // e.g. section, faculty, room
  colorIndex: number;
  status: string;
}

export interface DropPreview {
  day: DayOfWeek;
  startMin: number;
  endMin: number;
}

export const dayDroppableId = (day: DayOfWeek) => `day:${day}`;
export const entryDraggableId = (id: string) => `entry:${id}`;

export function Timetable({
  days,
  entries,
  info,
  conflictIndex,
  editable,
  highlightId,
  preview,
  onOpen,
  onEmptySlot,
  grid = DEFAULT_GRID,
}: {
  days: DayOfWeek[];
  entries: SchedulerEntry[];
  info: (e: SchedulerEntry) => BlockInfo;
  conflictIndex: Map<string, { severity: Severity; messages: string[] }>;
  editable: boolean;
  highlightId: string | null;
  preview: DropPreview | null;
  onOpen: (entry: SchedulerEntry) => void;
  onEmptySlot?: (day: DayOfWeek, startMin: number) => void;
  grid?: GridConfig;
}) {
  const height = gridHeight(grid);
  const hours: number[] = [];
  for (let m = grid.dayStart; m < grid.dayEnd; m += 60) hours.push(m);

  const byDay = useMemo(() => {
    const map = new Map<DayOfWeek, SchedulerEntry[]>();
    for (const d of days) map.set(d, []);
    for (const e of entries) map.get(e.dayOfWeek)?.push(e);
    for (const list of map.values()) list.sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
    return map;
  }, [entries, days]);

  const containerRef = useRef<HTMLDivElement>(null);

  // Arrow-key navigation between blocks (when not mid-drag).
  function onBlockKeyDown(e: React.KeyboardEvent, entry: SchedulerEntry) {
    if (e.key === "Enter") {
      e.preventDefault();
      onOpen(entry);
      return;
    }
    const dayIndex = days.indexOf(entry.dayOfWeek);
    const sameDay = byDay.get(entry.dayOfWeek) ?? [];
    const idx = sameDay.findIndex((x) => x.id === entry.id);
    let target: SchedulerEntry | undefined;
    if (e.key === "ArrowDown") target = sameDay[idx + 1];
    if (e.key === "ArrowUp") target = sameDay[idx - 1];
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      const step = e.key === "ArrowRight" ? 1 : -1;
      for (let d = dayIndex + step; d >= 0 && d < days.length; d += step) {
        const list = byDay.get(days[d]) ?? [];
        if (list.length) {
          target = list.reduce((best, x) =>
            Math.abs(x.startMin - entry.startMin) < Math.abs(best.startMin - entry.startMin) ? x : best
          );
          break;
        }
      }
    }
    if (e.key === "Home") target = entries.slice().sort(sortByDayTime(days))[0];
    if (e.key === "End") target = entries.slice().sort(sortByDayTime(days)).at(-1);
    if (target) {
      e.preventDefault();
      containerRef.current?.querySelector<HTMLElement>(`[data-entry-id="${target.id}"]`)?.focus();
    }
  }

  const firstId = useMemo(() => entries.slice().sort(sortByDayTime(days))[0]?.id, [entries, days]);

  return (
    <div className="overflow-x-auto rounded-lg border bg-card" ref={containerRef}>
      <div
        role="grid"
        aria-label="Weekly timetable"
        aria-rowcount={(grid.dayEnd - grid.dayStart) / grid.slot}
        aria-colcount={days.length}
        className="min-w-[760px]"
        style={{ display: "grid", gridTemplateColumns: `64px repeat(${days.length}, minmax(110px, 1fr))` }}
      >
        <div className="sticky top-0 z-20 border-b bg-card" />
        {days.map((d) => (
          <div key={d} role="columnheader" className="sticky top-0 z-20 border-b border-l bg-card px-2 py-2 text-center text-xs font-semibold">
            {DAY_LONG[d]}
          </div>
        ))}

        <div style={{ height }} className="relative" aria-hidden>
          {hours.map((h) => (
            <div
              key={h}
              style={{ top: minutesToY(h, grid) }}
              className="absolute right-2 -translate-y-1/2 text-[10px] font-medium text-muted-foreground"
            >
              {formatTime(h)}
            </div>
          ))}
        </div>

        {days.map((day) => (
          <DayColumn
            key={day}
            day={day}
            height={height}
            grid={grid}
            hours={hours}
            editable={editable}
            onEmptySlot={onEmptySlot}
            preview={preview?.day === day ? preview : null}
          >
            {(() => {
              const list = byDay.get(day) ?? [];
              const lanes = layoutLanes(list);
              return list.map((entry) => (
                <Block
                  key={entry.id}
                  entry={entry}
                  info={info(entry)}
                  lane={lanes.get(entry.id) ?? { lane: 0, lanes: 1 }}
                  grid={grid}
                  editable={editable}
                  conflict={conflictIndex.get(entry.id)}
                  highlighted={highlightId === entry.id}
                  tabbable={entry.id === firstId}
                  onOpen={onOpen}
                  onKeyDown={onBlockKeyDown}
                />
              ));
            })()}
          </DayColumn>
        ))}
      </div>
    </div>
  );
}

function sortByDayTime(days: DayOfWeek[]) {
  return (a: SchedulerEntry, b: SchedulerEntry) =>
    days.indexOf(a.dayOfWeek) - days.indexOf(b.dayOfWeek) || a.startMin - b.startMin;
}

function DayColumn({
  day,
  height,
  grid,
  hours,
  editable,
  onEmptySlot,
  preview,
  children,
}: {
  day: DayOfWeek;
  height: number;
  grid: GridConfig;
  hours: number[];
  editable: boolean;
  onEmptySlot?: (day: DayOfWeek, startMin: number) => void;
  preview: DropPreview | null;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: dayDroppableId(day), disabled: !editable, data: { day } });

  return (
    <div
      ref={setNodeRef}
      role="gridcell"
      aria-label={DAY_LONG[day]}
      style={{ height }}
      className={cn("relative border-l transition-colors", isOver && "bg-primary/[0.04]")}
      onDoubleClick={(e) => {
        if (!editable || !onEmptySlot || e.target !== e.currentTarget) return;
        const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
        const start = grid.dayStart + Math.floor(y / grid.rowHeight) * grid.slot;
        onEmptySlot(day, start);
      }}
    >
      {hours.map((h) => (
        <div key={h} aria-hidden style={{ top: minutesToY(h, grid) }} className="pointer-events-none absolute inset-x-0 border-t border-border/70" />
      ))}
      {hours.map((h) => (
        <div
          key={`half-${h}`}
          aria-hidden
          style={{ top: minutesToY(h + 30, grid) }}
          className="pointer-events-none absolute inset-x-0 border-t border-dashed border-border/40"
        />
      ))}
      {preview && (
        <div
          aria-hidden
          style={{ top: minutesToY(preview.startMin, grid), height: minutesToY(preview.endMin, grid) - minutesToY(preview.startMin, grid) }}
          className="pointer-events-none absolute inset-x-1 z-10 rounded-md border-2 border-dashed border-primary bg-primary/10 px-1.5 py-1 text-[10px] font-semibold text-primary"
        >
          {formatRange(preview.startMin, preview.endMin)}
        </div>
      )}
      {children}
    </div>
  );
}

const Block = memo(function Block({
  entry,
  info,
  lane,
  grid,
  editable,
  conflict,
  highlighted,
  tabbable,
  onOpen,
  onKeyDown,
}: {
  entry: SchedulerEntry;
  info: BlockInfo;
  lane: { lane: number; lanes: number };
  grid: GridConfig;
  editable: boolean;
  conflict?: { severity: Severity; messages: string[] };
  highlighted: boolean;
  tabbable: boolean;
  onOpen: (e: SchedulerEntry) => void;
  onKeyDown: (e: React.KeyboardEvent, entry: SchedulerEntry) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: entryDraggableId(entry.id),
    disabled: !editable,
    data: { kind: "entry", entry },
  });
  const { active } = useDndContext();
  const ref = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (highlighted) {
      ref.current?.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
      ref.current?.focus({ preventScroll: true });
    }
  }, [highlighted]);

  const top = minutesToY(entry.startMin, grid);
  const height = Math.max(minutesToY(entry.endMin, grid) - top, 22);
  const width = 100 / lane.lanes;
  const compact = height < 56;

  const statusLabel = entry.status === "PUBLISHED" ? "" : entry.status.charAt(0) + entry.status.slice(1).toLowerCase();
  const label = [
    `${info.title} ${info.subtitle}`,
    `${DAY_LONG[entry.dayOfWeek]} ${formatRange(entry.startMin, entry.endMin)}`,
    ...info.lines,
    statusLabel && `Status: ${statusLabel}`,
    conflict && `${conflict.severity === "conflict" ? "Conflict" : "Warning"}: ${conflict.messages.join(" ")}`,
  ]
    .filter(Boolean)
    .join(". ");

  return (
    <button
      type="button"
      ref={(el) => {
        ref.current = el;
        setNodeRef(el);
      }}
      data-entry-id={entry.id}
      {...attributes}
      {...listeners}
      tabIndex={tabbable ? 0 : -1}
      aria-label={label}
      aria-roledescription={editable ? "draggable class" : "class"}
      title={label}
      onClick={() => onOpen(entry)}
      onKeyDown={(e) => {
        // While a keyboard drag is active, dnd-kit owns the arrow keys.
        if (!active) onKeyDown(e, entry);
        if (!e.defaultPrevented) listeners?.onKeyDown?.(e);
      }}
      style={{ top, height, left: `calc(${lane.lane * width}% + 2px)`, width: `calc(${width}% - 4px)` }}
      className={cn(
        "absolute z-[1] overflow-hidden rounded-md border px-1.5 py-1 text-left text-[11px] leading-tight shadow-xs outline-none transition-[box-shadow,opacity]",
        "focus-visible:z-10 focus-visible:ring-3 focus-visible:ring-ring/60",
        PALETTE[info.colorIndex % PALETTE.length],
        entry.status === "DRAFT" && "border-dashed",
        conflict?.severity === "conflict" &&
          "border-2 border-red-500 bg-red-50 text-red-950 ring-2 ring-red-500/30 dark:border-red-400 dark:bg-red-500/20 dark:text-red-50",
        conflict?.severity === "warning" && "border-amber-500 ring-1 ring-amber-500/40",
        editable && "cursor-grab active:cursor-grabbing",
        isDragging && "opacity-40",
        highlighted && "animate-pulse ring-4 ring-red-500/60"
      )}
    >
      <span className="flex items-center gap-1 font-semibold">
        {conflict?.severity === "conflict" && <WarningOctagon className="size-3.5 shrink-0 text-red-600 dark:text-red-300" weight="fill" />}
        {conflict?.severity === "warning" && <Warning className="size-3.5 shrink-0 text-amber-600" weight="fill" />}
        <span className="truncate">{info.title}</span>
        {statusLabel && <span className="ml-auto shrink-0 rounded bg-black/10 px-1 text-[9px] font-medium uppercase dark:bg-white/15">{statusLabel}</span>}
      </span>
      {!compact && <span className="block truncate opacity-80">{formatRange(entry.startMin, entry.endMin)}</span>}
      {info.lines.slice(0, compact ? 1 : 3).map((l, i) => (
        <span key={i} className="block truncate opacity-90">
          {l}
        </span>
      ))}
    </button>
  );
});
