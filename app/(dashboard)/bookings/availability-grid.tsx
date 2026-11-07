"use client";

import { useEffect, useState, useTransition } from "react";
import { CaretLeft, CaretRight } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { formatRange, formatTime } from "@/lib/scheduler/timetable";
import type { AvailabilityBlock } from "@/lib/bookings/availability";
import { cn } from "@/lib/utils";
import { availabilityAction } from "./actions";

type Data = { rooms: { id: string; name: string; capacity: number; building: string; closed: boolean }[]; blocks: AvailabilityBlock[] };

const TONE: Record<string, string> = {
  CLASS: "bg-primary/25 border-primary/40",
  EXAMINATION: "bg-info/30 border-info/50",
  BOOKING: "bg-success/30 border-success/50",
  URGENT: "bg-danger/40 border-danger [background-image:repeating-linear-gradient(45deg,transparent_0_4px,rgb(255_255_255/0.25)_4px_8px)]",
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
      className={cn("relative h-7 rounded bg-muted/40", pickable && date >= today && "cursor-pointer hover:bg-primary/10")}
      title={pickable && date >= today ? "Click to book this room at this time" : undefined}
      onClick={pickable && date >= today ? (e) => pick(roomId, date, e) : undefined}
    >
      {data?.blocks.filter((b) => b.roomId === roomId && b.date === date).map((b, i) => (
        <span key={i} onClick={(e) => e.stopPropagation()} title={`${b.label}, ${formatRange(b.startMin, b.endMin)}${b.urgent ? " (urgent)" : ""}`} style={pos(b)}
          className={cn("absolute inset-y-0.5 overflow-hidden rounded border px-1 text-[10px] leading-6 whitespace-nowrap", TONE[b.urgent ? "URGENT" : b.kind])}>
          {days === 1 ? b.label : ""}
        </span>
      ))}
    </div>
  );

  return (
    <section aria-labelledby="availability-title" className="rounded-xl border bg-card p-5">
      <h2 id="availability-title" className="text-base font-semibold">Room availability <span className="text-sm font-normal text-muted-foreground">· in the day view, click a free time to book that room</span></h2>
      <div className="mt-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="icon" variant="outline" className="size-9" aria-label="Previous" onClick={() => setFrom(addDays(from, -days))}><CaretLeft className="size-4" /></Button>
          <Input type="date" value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} className="h-9 w-40" aria-label="Start date" />
          <Button size="icon" variant="outline" className="size-9" aria-label="Next" onClick={() => setFrom(addDays(from, days))}><CaretRight className="size-4" /></Button>
          <div role="radiogroup" aria-label="View" className="flex rounded-md border p-0.5">
            {([[1, "Day"], [6, "Week"]] as const).map(([v, label]) => (
              <button key={v} role="radio" aria-checked={days === v} onClick={() => setDays(v)} className="rounded px-3 py-1 text-sm aria-checked:bg-muted aria-checked:font-semibold">{label}</button>
            ))}
          </div>
          <ul className="flex flex-wrap gap-3 text-xs text-muted-foreground sm:ml-auto" aria-label="Legend">
            {[["CLASS", "Class"], ["EXAMINATION", "Examination"], ["BOOKING", "Booking"], ["URGENT", "Urgent booking"]].map(([k, label]) => <li key={k} className="flex items-center gap-1.5"><span className={cn("size-3 rounded border", TONE[k])} />{label}</li>)}
          </ul>
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {!data && loading ? <Skeleton className="h-48 w-full" /> : data && (
          data.rooms.length === 0 ? <p className="text-sm text-muted-foreground">No rooms to show.</p> : (
            <div className={cn("overflow-x-auto", loading && "opacity-60")}>
              <div className="min-w-[720px] space-y-1">
                <div className="grid grid-cols-[10rem_1fr] gap-2 text-[11px] text-muted-foreground">
                  <span />
                  {days === 1
                    ? <div className="relative h-4">{ticks.map((t) => <span key={t} className="absolute -translate-x-1/2" style={{ left: `${((t - hours.openMin) / span) * 100}%` }}>{formatTime(t)}</span>)}</div>
                    : <div className="grid grid-cols-6 gap-1">{dates.map((d) => <span key={d}>{shortDay(d)}</span>)}</div>}
                </div>
                {data.rooms.map((r) => (
                  <div key={r.id} className="grid grid-cols-[10rem_1fr] items-center gap-2">
                    <span className={cn("truncate text-[13px]", r.closed && "text-muted-foreground line-through")} title={`${r.name}, ${r.building}, ${r.capacity} seats${r.closed ? ", closed" : ""}`}>{r.name}</span>
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
