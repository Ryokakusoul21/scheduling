// Client-safe helpers for the student portal; all clock math uses Asia/Manila time.

export const TIME_ZONE = "Asia/Manila";

export const ACTIVITY_TYPES: Record<string, string> = {
  SCHOOL_EVENT: "School event",
  HOLIDAY: "Holiday",
  CLASS_SUSPENSION: "Class suspension",
  EXAMINATION_WEEK: "Examination week",
};

/** Activity types that change whether or how classes meet. */
export const AFFECTS_CLASSES = new Set(["HOLIDAY", "CLASS_SUSPENSION", "EXAMINATION_WEEK"]);

/** Activity types on which classes do not meet. */
export const NO_CLASS_TYPES = new Set(["HOLIDAY", "CLASS_SUSPENSION"]);

const WEEKDAY_TO_ENUM: Record<string, string> = { Mon: "MONDAY", Tue: "TUESDAY", Wed: "WEDNESDAY", Thu: "THURSDAY", Fri: "FRIDAY", Sat: "SATURDAY", Sun: "SUNDAY" };

/** Current Manila date (YYYY-MM-DD), weekday enum, and minutes since midnight. */
export function manilaNow(at: Date = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(at)
      .map((p) => [p.type, p.value])
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    day: WEEKDAY_TO_ENUM[parts.weekday],
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

/** Morning, afternoon, or evening greeting for the given Manila minutes. */
export function greeting(minutes: number) {
  if (minutes < 12 * 60) return "Good morning";
  if (minutes < 18 * 60) return "Good afternoon";
  return "Good evening";
}

const dateOnly = (iso: string) => new Date(`${iso}T00:00:00Z`);
const fmt = (iso: string, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-US", { timeZone: "UTC", ...opts }).format(dateOnly(iso));

/** Long date such as "Thursday, November 5, 2026". */
export function longDate(iso: string) {
  return fmt(iso, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

/** Compact date range: "Nov 2, 2026", "Nov 2-7, 2026", "Nov 30 - Dec 4, 2026", or across years. */
export function formatDateRange(start: string, end: string) {
  if (start === end) return fmt(start, { month: "short", day: "numeric", year: "numeric" });
  const [sy, sm] = start.split("-");
  const [ey, em] = end.split("-");
  if (sy !== ey) return `${fmt(start, { month: "short", day: "numeric", year: "numeric" })} - ${fmt(end, { month: "short", day: "numeric", year: "numeric" })}`;
  if (sm !== em) return `${fmt(start, { month: "short", day: "numeric" })} - ${fmt(end, { month: "short", day: "numeric" })}, ${sy}`;
  return `${fmt(start, { month: "short", day: "numeric" })}-${fmt(end, { day: "numeric" })}, ${sy}`;
}

/** Human duration until a start time: "now", "in 25 min", "in 2 hr 5 min". */
export function startsIn(minutes: number) {
  if (minutes <= 0) return "now";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `in ${h ? `${h} hr ` : ""}${m || !h ? `${m} min` : ""}`.trim();
}

/** Activities covering the given date. */
export function activitiesOn<T extends { startDate: string; endDate: string }>(activities: T[], date: string) {
  return activities.filter((a) => a.startDate <= date && date <= a.endDate);
}
