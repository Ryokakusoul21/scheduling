/** Calendar of Activities: view ranges, navigation, and the color legend (browser-safe). */
import { addDays, dayOfWeek } from "@/lib/occupancy/engine";
import { layoutLanes } from "@/lib/scheduler/timetable";

export type CalendarView = "month" | "week" | "day";

export const EVENT_TYPES = ["CLASS", "EXAMINATION", "BOOKING", "SCHOOL_EVENT", "HOLIDAY", "CLASS_SUSPENSION"] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const EVENT_LABELS: Record<EventType, string> = {
  CLASS: "Classes",
  EXAMINATION: "Examinations",
  BOOKING: "Room bookings",
  SCHOOL_EVENT: "School events",
  HOLIDAY: "Holidays",
  CLASS_SUSPENSION: "Class suspensions",
};

/** Tailwind classes per type, readable in light and dark mode. */
export const EVENT_COLORS: Record<EventType, string> = {
  CLASS: "border-blue-500/50 bg-blue-500/10 text-blue-800 dark:text-blue-200",
  EXAMINATION: "border-violet-500/50 bg-violet-500/10 text-violet-800 dark:text-violet-200",
  BOOKING: "border-emerald-500/50 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
  SCHOOL_EVENT: "border-amber-500/50 bg-amber-500/15 text-amber-900 dark:text-amber-200",
  HOLIDAY: "border-rose-500/50 bg-rose-500/10 text-rose-800 dark:text-rose-200",
  CLASS_SUSPENSION: "border-orange-500/50 bg-orange-500/15 text-orange-900 dark:text-orange-200",
};

export const EVENT_DOTS: Record<EventType, string> = {
  CLASS: "bg-blue-500",
  EXAMINATION: "bg-violet-500",
  BOOKING: "bg-emerald-500",
  SCHOOL_EVENT: "bg-amber-500",
  HOLIDAY: "bg-rose-500",
  CLASS_SUSPENSION: "bg-orange-500",
};

const MONDAY_OFFSET: Record<string, number> = { MONDAY: 0, TUESDAY: 1, WEDNESDAY: 2, THURSDAY: 3, FRIDAY: 4, SATURDAY: 5, SUNDAY: 6 };

export function startOfWeek(date: string) {
  return addDays(date, -MONDAY_OFFSET[dayOfWeek(date)]);
}

/** Visible date range: whole weeks covering the month, Monday to Sunday, or the single day. */
export function calendarRange(view: CalendarView, date: string) {
  if (view === "day") return { from: date, to: date };
  if (view === "week") return { from: startOfWeek(date), to: addDays(startOfWeek(date), 6) };
  const first = `${date.slice(0, 7)}-01`;
  const next = new Date(`${first}T00:00:00Z`);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const last = addDays(next.toISOString().slice(0, 10), -1);
  return { from: startOfWeek(first), to: addDays(startOfWeek(last), 6) };
}

/** Moves one month, week, or day forward (dir = 1) or back (dir = -1). */
export function shiftDate(view: CalendarView, date: string, dir: 1 | -1) {
  if (view === "day") return addDays(date, dir);
  if (view === "week") return addDays(date, 7 * dir);
  const d = new Date(`${date.slice(0, 7)}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + dir);
  return d.toISOString().slice(0, 10);
}

export function formatLongDate(date: string, opts: Intl.DateTimeFormatOptions = { weekday: "long", month: "long", day: "numeric", year: "numeric" }) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-PH", { ...opts, timeZone: "UTC" });
}

export interface TimedItem {
  id: string;
  startMin: number;
  endMin: number;
}

/**
 * Lays out overlapping items side by side, but never more than `maxLanes` across: when a group of
 * overlapping items needs more, the last lane becomes a "+N more" block covering the rest of the group.
 */
export function collapseLanes(items: TimedItem[], maxLanes: number) {
  const lanes = layoutLanes(items);
  const shown = new Map<string, { lane: number; lanes: number }>();
  const overflow: { startMin: number; endMin: number; lane: number; lanes: number; ids: string[] }[] = [];
  const sorted = [...items].sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);

  // Groups are runs of items connected by overlap; layoutLanes gives every item in a group the same lane count.
  let group: TimedItem[] = [];
  let groupEnd = -Infinity;
  const flush = () => {
    if (!group.length) return;
    const count = lanes.get(group[0].id)!.lanes;
    if (count <= maxLanes) {
      for (const g of group) shown.set(g.id, lanes.get(g.id)!);
    } else {
      const hidden = group.filter((g) => lanes.get(g.id)!.lane >= maxLanes - 1);
      for (const g of group) if (!hidden.includes(g)) shown.set(g.id, { lane: lanes.get(g.id)!.lane, lanes: maxLanes });
      overflow.push({
        startMin: Math.min(...hidden.map((h) => h.startMin)),
        endMin: Math.max(...hidden.map((h) => h.endMin)),
        lane: maxLanes - 1,
        lanes: maxLanes,
        ids: hidden.map((h) => h.id),
      });
    }
    group = [];
  };
  for (const item of sorted) {
    if (item.startMin >= groupEnd) flush();
    group.push(item);
    groupEnd = Math.max(groupEnd, item.endMin);
  }
  flush();
  return { shown, overflow };
}
