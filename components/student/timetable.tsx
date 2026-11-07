"use client";

import { useMemo, useState } from "react";
import { CalendarBlank, CaretDown, ListBullets, MagnifyingGlass, Rows, SquaresFour } from "@phosphor-icons/react/ssr";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ux/native-select";
import { EmptyState } from "@/components/ux/states";
import { formatRange, formatTime, layoutLanes } from "@/lib/scheduler/timetable";
import { activitiesOn, manilaNow, NO_CLASS_TYPES } from "@/lib/student/format";
import { DAY_ENUMS, shiftDate } from "@/lib/student/schedule";
import { subjectColors } from "@/lib/student/colors";
import { useNow } from "@/lib/student/use-now";
import type { PortalActivity, PortalClass, PortalMove } from "@/lib/student/portal";
import { cn } from "@/lib/utils";
import { ClassDetailsDrawer } from "./class-drawer";
import { ComponentTag } from "./timetable-parts";
import { MovedList, MovedTag } from "./moves";

type View = "week" | "day" | "list";
const HOUR_PX = 72;
const titleCase = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();
const shortDay = (s: string) => s.charAt(0) + s.slice(1, 3).toLowerCase();
const options = (values: string[]) => [...new Set(values)].sort().map((v) => ({ value: v, label: v }));

/** Student timetable with weekly grid, day agenda, and grouped list views, shared filters, and a details drawer. */
export function StudentTimetable({ classes, activities, moves }: { classes: PortalClass[]; activities: PortalActivity[]; moves: PortalMove[] }) {
  const [view, setView] = useState<View>("week");
  const [subject, setSubject] = useState("");
  const [faculty, setFaculty] = useState("");
  const [room, setRoom] = useState("");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const at = useNow();

  const colors = useMemo(() => subjectColors(classes.map((c) => c.subjectCode)), [classes]);
  const q = query.trim().toLowerCase();
  const shown = classes.filter(
    (c) =>
      (!subject || c.subjectCode === subject) &&
      (!faculty || c.faculty === faculty) &&
      (!room || (c.room ?? "To be announced") === room) &&
      (!q || [c.subjectCode, c.subjectName, c.faculty, c.room ?? ""].some((v) => v.toLowerCase().includes(q)))
  );
  const filtered = subject || faculty || room || q;

  // Dates of the current Monday-to-Sunday week in Manila, used for the today highlight and no-class days.
  const now = at ? manilaNow(at) : null;
  const week = now ? DAY_ENUMS.map((_, i) => shiftDate(now.date, i - DAY_ENUMS.indexOf(now.day))) : [];
  const dayOff = new Map(
    week.map(({ date, day }) => [day, activitiesOn(activities, date).find((a) => NO_CLASS_TYPES.has(a.type) && a.startMin == null)?.title ?? null])
  );
  const days = DAY_ENUMS.filter((d) => d !== "SUNDAY" || classes.some((c) => c.dayOfWeek === "SUNDAY"));
  const moved = new Set(moves.map((m) => m.subjectCode));
  const ctx = { shown, colors, now, dayOff, days, moved, onOpen: setOpen };

  if (classes.length === 0) {
    return <EmptyState title="Schedule not published yet" description="Your timetable appears here once it is published." />;
  }

  return (
    <div className="space-y-3">
      <MovedList moves={moves} />
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div role="tablist" aria-label="Timetable view" className="flex rounded-lg border p-0.5">
            {(
              [
                ["week", "Week", SquaresFour],
                ["day", "Day", Rows],
                ["list", "List", ListBullets],
              ] as const
            ).map(([v, label, Icon]) => (
              <button
                key={v}
                role="tab"
                type="button"
                aria-selected={view === v}
                onClick={() => setView(v)}
                className={cn(
                  "flex min-h-11 items-center gap-1.5 rounded-md px-3 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-9",
                  view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                )}
              >
                <Icon className="size-4" aria-hidden /> {label}
              </button>
            ))}
          </div>
          <label className="relative min-w-48 flex-1">
            <span className="sr-only">Search classes</span>
            <MagnifyingGlass className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search subject, faculty, or room" className="h-11 pl-8 sm:h-9" />
          </label>
          <NativeSelect aria-label="Filter by subject" placeholder="All subjects" value={subject} onChange={(e) => setSubject(e.target.value)} options={options(classes.map((c) => c.subjectCode))} className="w-40" />
          <NativeSelect aria-label="Filter by faculty" placeholder="All faculty" value={faculty} onChange={(e) => setFaculty(e.target.value)} options={options(classes.map((c) => c.faculty))} className="w-44" />
          <NativeSelect aria-label="Filter by room" placeholder="All rooms" value={room} onChange={(e) => setRoom(e.target.value)} options={options(classes.map((c) => c.room ?? "To be announced"))} className="w-44" />
          {filtered && (
            <Button variant="ghost" onClick={() => (setSubject(""), setFaculty(""), setRoom(""), setQuery(""))}>
              Clear filters
            </Button>
          )}
        </CardContent>
      </Card>

      {shown.length === 0 ? (
        <EmptyState title="No classes match your filters" description="Try another subject, faculty member, or room." />
      ) : view === "list" ? (
        <ListView {...ctx} />
      ) : view === "day" ? (
        <DayAgenda {...ctx} />
      ) : (
        <>
          {/* The grid needs width; smaller screens get the day agenda instead. */}
          <div className="hidden lg:block">
            <WeekGrid {...ctx} />
          </div>
          <div className="lg:hidden">
            <DayAgenda {...ctx} />
          </div>
        </>
      )}

      <ClassDetailsDrawer subjectCode={open} classes={classes} onClose={() => setOpen(null)} />
    </div>
  );
}

interface ViewProps {
  shown: PortalClass[];
  colors: Map<string, string>;
  now: ReturnType<typeof manilaNow> | null;
  dayOff: Map<string, string | null>;
  days: string[];
  moved: Set<string>;
  onOpen: (code: string) => void;
}

function WeekGrid({ shown, colors, now, dayOff, days, moved, onOpen }: ViewProps) {
  const start = Math.min(7 * 60, Math.floor(Math.min(...shown.map((c) => c.startMin)) / 60) * 60);
  const end = Math.max(17 * 60, Math.ceil(Math.max(...shown.map((c) => c.endMin)) / 60) * 60);
  const y = (m: number) => ((m - start) / 60) * HOUR_PX;
  const hours = Array.from({ length: (end - start) / 60 + 1 }, (_, i) => start + i * 60);

  return (
    <Card className="overflow-hidden py-0">
      <div className="grid" style={{ gridTemplateColumns: `64px repeat(${days.length}, minmax(0, 1fr))` }}>
        <div className="sticky top-0 z-20 border-b bg-card" />
        {days.map((d) => {
          const today = now?.day === d;
          return (
            <div key={d} className={cn("sticky top-0 z-20 border-b border-l bg-card px-2 py-2.5 text-center", today && "bg-primary/10")}>
              <p className={cn("text-sm font-semibold", today && "text-primary")}>{titleCase(d)}</p>
              {today && <p className="text-xs font-medium text-primary">Today</p>}
              {dayOff.get(d) && <p className="truncate text-xs font-medium text-emerald-700 dark:text-emerald-400">No classes: {dayOff.get(d)}</p>}
            </div>
          );
        })}

        <div className="relative" style={{ height: y(end) }}>
          {hours.slice(0, -1).map((h) => (
            <span key={h} className="absolute right-2 text-xs text-muted-foreground tabular-nums" style={{ top: y(h) + 4 }}>
              {formatTime(h).replace(":00", "")}
            </span>
          ))}
        </div>

        {days.map((d) => {
          const dayClasses = shown.filter((c) => c.dayOfWeek === d);
          const lanes = layoutLanes(dayClasses);
          const today = now?.day === d;
          const showNow = today && now && now.minutes >= start && now.minutes <= end;
          return (
            <div
              key={d}
              className={cn("relative border-l", today && "bg-primary/[0.03]", dayOff.get(d) && "bg-[repeating-linear-gradient(135deg,transparent,transparent_8px,var(--color-muted)_8px,var(--color-muted)_10px)]")}
              style={{ height: y(end) }}
            >
              {hours.map((h) => (
                <div key={h} className="absolute inset-x-0 border-t border-border/60" style={{ top: y(h) }} />
              ))}
              {dayClasses.map((c) => {
                const l = lanes.get(c.id) ?? { lane: 0, lanes: 1 };
                const height = y(c.endMin) - y(c.startMin);
                const live = today && now && c.startMin <= now.minutes && now.minutes < c.endMin;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => onOpen(c.subjectCode)}
                    aria-label={`${c.subjectCode} ${c.subjectName}, ${titleCase(d)} ${formatRange(c.startMin, c.endMin)}, ${c.room ?? "room to be announced"}, ${c.faculty}. Open details`}
                    className={cn(
                      "absolute flex flex-col gap-0.5 overflow-hidden rounded-md border border-l-4 border-black/5 px-2 py-1.5 text-left text-xs leading-snug shadow-xs outline-none transition-shadow hover:shadow-md focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring",
                      colors.get(c.subjectCode),
                      live && "ring-2 ring-red-600"
                    )}
                    style={{ top: y(c.startMin) + 1, height: height - 2, left: `calc(${(l.lane / l.lanes) * 100}% + 2px)`, width: `calc(${100 / l.lanes}% - 4px)` }}
                  >
                    <span className="flex items-center justify-between gap-1">
                      <span className="truncate text-sm font-semibold">{c.subjectCode}</span>
                      {live && <span className="shrink-0 rounded bg-red-600 px-1 text-[10px] font-semibold text-white uppercase">Live</span>}
                    </span>
                    {height >= 90 && <span className="line-clamp-2">{c.subjectName}</span>}
                    <span className="truncate opacity-85">{formatRange(c.startMin, c.endMin)}</span>
                    {height >= 70 && <span className="truncate opacity-85">{c.room ?? "Room to be announced"}</span>}
                    {height >= 120 && <span className="truncate opacity-85">{c.faculty}</span>}
                    {height >= 140 && <span className="mt-auto flex flex-wrap gap-1"><ComponentTag component={c.component} />{moved.has(c.subjectCode) && <MovedTag />}</span>}
                  </button>
                );
              })}
              {showNow && (
                <div className="pointer-events-none absolute inset-x-0 z-10 flex items-center" style={{ top: y(now.minutes) }} aria-hidden>
                  <span className="-ml-1 size-2.5 rounded-full bg-red-600" />
                  <span className="h-0.5 flex-1 bg-red-600" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function DayAgenda({ shown, colors, now, dayOff, days, moved, onOpen }: ViewProps) {
  const fallback = days.find((d) => shown.some((c) => c.dayOfWeek === d)) ?? days[0];
  const [picked, setPicked] = useState<string | null>(null);
  const day = picked ?? (now && days.includes(now.day) ? now.day : fallback);
  const list = shown.filter((c) => c.dayOfWeek === day).sort((a, b) => a.startMin - b.startMin);

  return (
    <div className="space-y-3">
      <div role="tablist" aria-label="Day" className="grid gap-1 rounded-xl border bg-card p-1" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
        {days.map((d) => {
          const count = shown.filter((c) => c.dayOfWeek === d).length;
          return (
            <button
              key={d}
              role="tab"
              type="button"
              aria-selected={d === day}
              onClick={() => setPicked(d)}
              className={cn(
                "flex min-h-12 flex-col items-center justify-center rounded-lg text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring",
                d === day ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                now?.day === d && d !== day && "text-primary"
              )}
            >
              {shortDay(d)}
              <span className="text-xs opacity-80">{count ? `${count} class${count > 1 ? "es" : ""}` : "Free"}</span>
            </button>
          );
        })}
      </div>

      {dayOff.get(day) && (
        <p className="rounded-lg border border-emerald-600/30 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
          No classes this {titleCase(day)}: {dayOff.get(day)}
        </p>
      )}
      {list.length === 0 ? (
        <EmptyState title={`No classes on ${titleCase(day)}`} description="Enjoy your free day." icon={CalendarBlank} />
      ) : (
        <ol className="space-y-2">
          {list.map((c) => {
            const live = now?.day === day && c.startMin <= now.minutes && now.minutes < c.endMin;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onOpen(c.subjectCode)}
                  className={cn("flex w-full gap-3 rounded-xl border border-l-4 p-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring", colors.get(c.subjectCode), live && "ring-2 ring-red-600")}
                >
                  <span className="w-20 shrink-0 text-sm font-semibold tabular-nums">
                    {formatTime(c.startMin)}
                    <span className="block text-xs font-normal opacity-80">{formatTime(c.endMin)}</span>
                  </span>
                  <span className="min-w-0 flex-1 space-y-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold">{c.subjectCode}</span>
                      <ComponentTag component={c.component} />
                      {moved.has(c.subjectCode) && <MovedTag />}
                      {live && <span className="rounded bg-red-600 px-1.5 text-xs font-semibold text-white">Live now</span>}
                    </span>
                    <span className="block text-sm">{c.subjectName}</span>
                    <span className="block text-xs opacity-85">
                      {c.room ?? "Room to be announced"} · {c.faculty}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

/** Joins back-to-back meetings of the same subject in the same room into one row. */
function mergeRuns(list: PortalClass[]) {
  const out: (PortalClass & { ids: string[] })[] = [];
  for (const c of list) {
    const last = out.at(-1);
    if (last && last.subjectCode === c.subjectCode && last.room === c.room && last.endMin === c.startMin) {
      last.endMin = c.endMin;
      last.ids.push(c.id);
    } else out.push({ ...c, ids: [c.id] });
  }
  return out;
}

function ListView({ shown, colors, now, dayOff, days, moved, onOpen }: ViewProps) {
  return (
    <div className="space-y-3">
      {days.map((d) => {
        const rows = mergeRuns(shown.filter((c) => c.dayOfWeek === d).sort((a, b) => a.startMin - b.startMin));
        if (rows.length === 0) return null;
        return (
          <details key={d} open className="group rounded-xl border bg-card shadow-xs">
            <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
              <CaretDown className="size-4 transition-transform group-not-open:-rotate-90" aria-hidden />
              {titleCase(d)}
              {now?.day === d && <span className="rounded-full bg-primary/10 px-2 text-xs text-primary">Today</span>}
              {dayOff.get(d) && <span className="rounded-full bg-emerald-100 px-2 text-xs text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">No classes: {dayOff.get(d)}</span>}
              <span className="ml-auto text-xs font-normal text-muted-foreground">
                {rows.length} class{rows.length > 1 ? "es" : ""}
              </span>
            </summary>
            <table className="w-full text-sm">
              <caption className="sr-only">{titleCase(d)} classes</caption>
              <thead className="border-y bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-2 font-medium">Time</th>
                  <th scope="col" className="px-2 py-2 font-medium">Subject</th>
                  <th scope="col" className="hidden px-2 py-2 font-medium md:table-cell">Faculty</th>
                  <th scope="col" className="hidden px-2 py-2 font-medium sm:table-cell">Room</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="px-4 py-2.5 align-top whitespace-nowrap tabular-nums">{formatRange(c.startMin, c.endMin)}</td>
                    <td className="px-2 py-2.5">
                      <button type="button" onClick={() => onOpen(c.subjectCode)} className="flex min-h-11 flex-col items-start text-left outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring sm:min-h-0">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className={cn("rounded border-l-4 px-1.5 font-semibold", colors.get(c.subjectCode))}>{c.subjectCode}</span>
                          <ComponentTag component={c.component} className="text-muted-foreground" />
                          {moved.has(c.subjectCode) && <MovedTag />}
                        </span>
                        <span>{c.subjectName}</span>
                        <span className="text-xs text-muted-foreground sm:hidden">
                          {c.room ?? "Room to be announced"} · {c.faculty}
                        </span>
                      </button>
                    </td>
                    <td className="hidden px-2 py-2.5 align-top md:table-cell">{c.faculty}</td>
                    <td className="hidden px-2 py-2.5 align-top sm:table-cell">{c.room ?? "To be announced"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        );
      })}
    </div>
  );
}
