"use client";

import { useEffect, useState, useTransition } from "react";
import { Buildings, CalendarBlank, CaretLeft, CaretRight, CursorClick } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { formatRange, formatTime } from "@/lib/scheduler/timetable";
import type { AvailabilityBlock } from "@/lib/bookings/availability";
import { cn } from "@/lib/utils";
import { availabilityAction } from "./actions";

type Data = { rooms: { id: string; name: string; capacity: number; building: string; closed: boolean }[]; blocks: AvailabilityBlock[] };

const TONE: Record<string, string> = {
  CLASS: "border-primary/40 bg-primary/15 text-primary",
  EXAMINATION: "border-info/50 bg-info/15 text-info",
  BOOKING: "border-success/50 bg-success/15 text-success",
  URGENT: "border-danger bg-danger/15 text-danger [background-image:repeating-linear-gradient(45deg,transparent_0_5px,rgb(255_255_255/0.35)_5px_10px)]",
};
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const shortDay = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });

/** Occupancy at a glance: rooms down the side, a day's hours (or a six-day week) across, urgent bookings striped red. */
/** `onPick` fills the booking form with the room, day, and time clicked in the one-day view. */
export function AvailabilityGrid({ today, hours, onPick }: { today: string; hours: { openMin: number; closeMin: number }; onPick?: (slot: { roomId: string; date: string; startMin: number; endMin: number }) => void }) {
  const [from, setFrom] = useState(today);
  const [days, setDays] = useState<1 | 6>(1);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, start] = useTransition();

  useEffect(() => {
    start(async () => {
      const r = await availabilityAction(from, days);
      if (r.ok) { setData(r.data); setError(null); } else setError(r.error);
    });
  }, [from, days]);

  const span = hours.closeMin - hours.openMin;
  const pos = (b: { startMin: number; endMin: number }) => ({ left: `${((Math.max(b.startMin, hours.openMin) - hours.openMin) / span) * 100}%`, width: `${((Math.min(b.endMin, hours.closeMin) - Math.max(b.startMin, hours.openMin)) / span) * 100}%` });
  const dates = Array.from({ length: days }, (_, i) => addDays(from, i));
  const ticks = Array.from({ length: Math.floor(span / 120) + 1 }, (_, i) => hours.openMin + i * 120);

  // A click on empty space in the one-day view picks that room and the half hour under the pointer.
  const pickable = !!onPick && days === 1;
  const pick = (roomId: string, date: string, e: React.MouseEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const startMin = Math.min(Math.floor((hours.openMin + ((e.clientX - box.left) / box.width) * span) / 30) * 30, hours.closeMin - 30);
    onPick?.({ roomId, date, startMin, endMin: Math.min(startMin + 60, hours.closeMin) });
  };

  const Lane = ({ roomId, date }: { roomId: string; date: string }) => (
    <div
      className={cn("relative h-10 overflow-hidden rounded-lg border border-border/60 bg-muted/25 transition-colors", pickable && date >= today && "cursor-crosshair hover:border-primary/40 hover:bg-primary/[0.04]")}
      title={pickable && date >= today ? "Click to book this room at this time" : undefined}
      onClick={pickable && date >= today ? (e) => pick(roomId, date, e) : undefined}
    >
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        {ticks.map((t) => <span key={t} className="absolute inset-y-0 border-l border-dashed border-border/60" style={{ left: `${((t - hours.openMin) / span) * 100}%` }} />)}
      </div>
      {data?.blocks.filter((b) => b.roomId === roomId && b.date === date).map((b, i) => (
        <span key={i} onClick={(e) => e.stopPropagation()} title={`${b.label}, ${formatRange(b.startMin, b.endMin)}${b.urgent ? " (urgent)" : ""}`} style={pos(b)}
          className={cn("absolute inset-y-1 z-10 flex items-center overflow-hidden rounded-md border px-1.5 text-[10px] font-medium leading-none shadow-sm", TONE[b.urgent ? "URGENT" : b.kind])}>
          <span className="block truncate">{b.label}</span>
        </span>
      ))}
    </div>
  );

  return (
    <section aria-labelledby="availability-title" className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/15 px-5 py-4">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Buildings className="size-5" /></span>
          <div>
            <h2 id="availability-title" className="text-lg font-semibold tracking-tight">Room availability</h2>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground"><CursorClick className="size-3.5" /> Choose a free time in Day view to start a booking.</p>
          </div>
        </div>
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground" aria-label="Legend">
          {[["CLASS", "Class"], ["EXAMINATION", "Examination"], ["BOOKING", "Booking"], ["URGENT", "Urgent booking"]].map(([k, label]) => <li key={k} className="flex items-center gap-1.5"><span className={cn("size-3 rounded-sm border", TONE[k])} />{label}</li>)}
        </ul>
      </div>
      <div className="space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-xl border bg-background p-1 shadow-xs">
              <Button size="icon" variant="ghost" className="size-8 rounded-lg" aria-label={days === 1 ? "Previous day" : "Previous week"} onClick={() => setFrom(addDays(from, -days))}><CaretLeft className="size-4" /></Button>
              <Input type="date" value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} className="h-8 w-36 border-0 bg-transparent px-1 shadow-none" aria-label="Start date" />
              <Button size="icon" variant="ghost" className="size-8 rounded-lg" aria-label={days === 1 ? "Next day" : "Next week"} onClick={() => setFrom(addDays(from, days))}><CaretRight className="size-4" /></Button>
            </div>
            <Button size="sm" variant="outline" className="h-10 rounded-xl" onClick={() => setFrom(today)}><CalendarBlank className="size-4" /> Today</Button>
          </div>
          <div role="group" aria-label="Availability view" className="flex rounded-xl border bg-muted/40 p-1">
            {([[1, "Day"], [6, "Week"]] as const).map(([v, label]) => (
              <button key={v} type="button" aria-pressed={days === v} onClick={() => setDays(v)} className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground aria-pressed:bg-background aria-pressed:text-foreground aria-pressed:shadow-sm">{label}</button>
            ))}
          </div>
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {!data && loading ? <Skeleton className="h-64 w-full rounded-xl" /> : data && (
          data.rooms.length === 0 ? <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">No rooms to show.</p> : (
            <div className={cn("overflow-x-auto rounded-xl border bg-background p-3", loading && "opacity-60")}>
              <div className="min-w-[1000px] space-y-1.5">
                <div className="grid grid-cols-[14rem_minmax(760px,1fr)] gap-3 pb-1 text-[11px] font-medium text-muted-foreground">
                  <span className="flex items-end px-3 pb-1 uppercase tracking-wider">Room <span className="ml-1.5 normal-case tracking-normal">({data.rooms.length})</span></span>
                  {days === 1
                    ? <div className="relative h-8 border-b">{ticks.map((t) => <span key={t} className="absolute bottom-1 -translate-x-1/2 whitespace-nowrap rounded bg-background px-1.5" style={{ left: `${((t - hours.openMin) / span) * 100}%` }}>{formatTime(t)}</span>)}</div>
                    : <div className="grid grid-cols-6 gap-1">{dates.map((d) => <span key={d} className="rounded-lg bg-muted/40 px-2 py-2 text-center">{shortDay(d)}</span>)}</div>}
                </div>
                {data.rooms.map((r) => (
                  <div key={r.id} className="grid grid-cols-[14rem_minmax(760px,1fr)] items-center gap-3">
                    <div className={cn("min-w-0 rounded-lg px-3 py-1.5", r.closed && "opacity-60")} title={`${r.name}, ${r.building}, ${r.capacity} seats${r.closed ? ", closed" : ""}`}>
                      <p className={cn("truncate text-sm font-medium", r.closed && "line-through")}>{r.name}</p>
                      <p className="truncate text-[11px] text-muted-foreground">{r.building} / {r.capacity} seats{r.closed && " / Closed"}</p>
                    </div>
                    {days === 1 ? <Lane roomId={r.id} date={from} /> : <div className="grid grid-cols-6 gap-1">{dates.map((d) => <Lane key={d} roomId={r.id} date={d} />)}</div>}
                  </div>
                ))}
              </div>
            </div>
          )
        )}
      </div>
    </section>
  );
}
