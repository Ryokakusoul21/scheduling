"use client";

import { useState } from "react";
import { CheckCircle, DoorOpen, Info, ProhibitInset, Siren, Warning } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ux/states";
import { ROOM_TYPES } from "@/lib/rooms/rooms";
import { formatRange } from "@/lib/scheduler/timetable";
import { isOverride } from "@/lib/bookings/plan";
import { cn } from "@/lib/utils";
import type { RoomOption } from "./actions";
import { formatDay } from "./format";
import type { SearchRequest } from "./search-form";

type Cap = { used: number; cap: number; remaining: number; reached: boolean; near: boolean };
export type Caps = { user: Cap; department: Cap | null } | null;

const typeLabel = (v: string) => ROOM_TYPES.find((t) => t.value === v)?.label ?? v;
const classes = (n: number) => `${n} ${n === 1 ? "class" : "classes"}`;

/** Ranked rooms; blocked rooms that an urgent booking could take offer "Urgent override". */
export function RoomResults({ options, caps, request, pending, canOverride, onBook, onOverride }: {
  options: RoomOption[] | null;
  caps: Caps;
  request: SearchRequest | null;
  pending: boolean;
  canOverride: boolean;
  onBook: (o: RoomOption) => void;
  onOverride: () => void;
}) {
  const [freeOnly, setFreeOnly] = useState(false);

  if (pending && !options) return <ResultsSkeleton />;
  if (!options || !request) return null;

  const urgent = isOverride(request.priority);
  const free = options.filter((o) => o.status === "FREE").length;
  const moves = options.filter((o) => o.status === "MOVES").length;
  const blocked = options.length - free - moves;
  const overridable = options.filter((o) => o.status === "BLOCKED" && o.overridable).length;
  const shown = options.filter((o) => (freeOnly ? o.status === "FREE" : true));
  const capWarning = caps && [caps.user, caps.department].find((c) => c && (c.near || c.reached));

  return (
    <section aria-labelledby="results-title" aria-busy={pending} className={cn("space-y-4 rounded-xl border bg-card p-5", pending && "opacity-60")}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 id="results-title" className="text-base font-semibold">
            Rooms for {formatDay(request.date)}, {formatRange(request.startMin, request.endMin)}
            {urgent && <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-danger/10 px-2 py-0.5 text-xs font-medium text-danger"><Siren className="size-3.5" /> Urgent</span>}
          </h2>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {free + moves} {free + moves === 1 ? "room" : "rooms"} available · {free} free, {moves} {urgent ? "require displacing classes or bookings" : "require moving a lower-priority booking"}
            {blocked > 0 && ` · ${blocked} unavailable`}
          </p>
        </div>
        <div className="flex gap-2" role="group" aria-label="Filter rooms">
          {[{ value: true, label: "Free only" }, { value: false, label: "Show all" }].map((f) => (
            <button key={f.label} type="button" aria-pressed={freeOnly === f.value} onClick={() => setFreeOnly(f.value)}
              className="h-8 rounded-full border px-3 text-[13px] font-medium transition-colors duration-150 hover:bg-muted aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background">
              {f.label}
            </button>
          ))}
        </div>
      </header>

      {capWarning && (
        <p className={cn("flex items-start gap-2 rounded-lg p-3 text-[13px]", capWarning.reached ? "bg-danger/10 text-danger" : "bg-warning/10 text-warning")}>
          <Warning className="mt-0.5 size-4 shrink-0" weight="fill" />
          {capWarning === caps?.user ? "You have" : "Your department has"} used {capWarning.used} of {capWarning.cap} urgent overrides this month.{capWarning.reached ? " No more can be made until next month." : ""}
        </p>
      )}

      {!urgent && canOverride && overridable > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-danger/30 bg-danger/5 p-3 text-[13px]">
          <p className="flex items-start gap-2"><Siren className="mt-0.5 size-4 shrink-0 text-danger" />{overridable} {overridable === 1 ? "room is" : "rooms are"} in use by a class or a lower-priority booking. An urgent booking can take {overridable === 1 ? "it" : "one"} and move what is there.</p>
          <Button size="sm" variant="outline" className="border-danger/40 text-danger hover:bg-danger/10" onClick={onOverride}><Siren className="size-4" /> Urgent override</Button>
        </div>
      )}

      {urgent && moves > 0 && !freeOnly && (
        <p className="flex items-start gap-2 rounded-lg bg-info/10 p-3 text-[13px] text-info">
          <Info className="mt-0.5 size-4 shrink-0" weight="fill" />
          You will see exactly which classes and bookings move, and where, before you confirm.
        </p>
      )}

      {free + moves === 0 || shown.length === 0 ? (
        <EmptyState
          icon={DoorOpen}
          title={freeOnly && free + moves > 0 ? "No free rooms for this time" : "No rooms available for this time"}
          description={<span className="block text-left">Try {freeOnly && moves > 0 ? "Show all, or " : ""}a different time or date, fewer attendees, or another room type{!urgent && canOverride && overridable > 0 ? ", or use Urgent override" : ""}.</span>}
          className="py-8"
        />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {shown.map((o) => (
            <li key={o.roomId} className={cn("flex flex-col gap-3 rounded-xl border p-4", o.status === "BLOCKED" && "bg-muted/40")}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">{o.name}</p>
                  <p className="text-[13px] text-muted-foreground">{o.location}{o.ownership === "OWN" ? " · Your department" : o.ownership === "SHARED" ? " · Shared" : ""}</p>
                </div>
                <Availability option={o} />
              </div>
              <dl className="flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
                <div><dt className="sr-only">Room type</dt><dd>{typeLabel(o.roomType)}</dd></div>
                <div><dt className="sr-only">Capacity</dt><dd className="tabular-nums">Fits {request.attendees} · capacity {o.capacity}</dd></div>
                {o.equipment.length > 0 && <div className="w-full"><dt className="sr-only">Equipment</dt><dd className="text-muted-foreground">{o.equipment.join(", ")}</dd></div>}
              </dl>
              {o.needsApproval && o.status !== "BLOCKED" && <p className="rounded-md bg-warning/10 p-2 text-[13px] text-warning">Needs approval from {o.needsApproval}; nothing moves until they approve.</p>}
              {o.status === "BLOCKED" && <p className="text-[13px] text-danger">{o.blockers[0]}</p>}
              {o.status !== "BLOCKED" && (
                <Button className="mt-auto h-9 self-start" variant={o.status === "FREE" ? "default" : "outline"} disabled={pending || !!capWarning?.reached && urgent} onClick={() => onBook(o)} aria-label={`Book ${o.name}`}>
                  {o.needsApproval ? "Request" : "Book"}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Availability({ option: o }: { option: RoomOption }) {
  const base = "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium";
  if (o.status === "FREE") return <span className={cn(base, "bg-success/10 text-success")}><CheckCircle className="size-3.5" weight="fill" /> Free</span>;
  if (o.status === "MOVES") {
    const parts = [o.items.length && `moves ${classes(o.items.length)}`, o.displaced.length && `moves ${o.displaced.length} booking${o.displaced.length > 1 ? "s" : ""}`].filter(Boolean).join(", ");
    return <span className={cn(base, "bg-warning/10 text-warning")}><Warning className="size-3.5" weight="fill" /> {parts[0].toUpperCase() + parts.slice(1)}</span>;
  }
  return <span className={cn(base, "bg-muted text-muted-foreground")}><ProhibitInset className="size-3.5" /> Unavailable</span>;
}

function ResultsSkeleton() {
  return (
    <div className="space-y-4 rounded-xl border bg-card p-5" aria-busy aria-label="Searching for rooms">
      <Skeleton className="h-5 w-72" />
      <Skeleton className="h-4 w-56" />
      <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-36 rounded-xl" />)}
      </div>
    </div>
  );
}
