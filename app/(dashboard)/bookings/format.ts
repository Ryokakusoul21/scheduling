/** Date helpers for the booking pages; dates are plain YYYY-MM-DD strings in Manila time. */

export const TIME_ZONE = "Asia/Manila";

/** "Wednesday, November 4, 2026" from "2026-11-04". */
export function formatDay(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

/** Today's date and the current minute of the day in Manila. */
export function manilaClock(now = new Date()) {
  const today = now.toLocaleDateString("en-CA", { timeZone: TIME_ZONE });
  const [h, m] = now.toLocaleTimeString("en-GB", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit", hour12: false }).split(":").map(Number);
  return { today, nowMin: (h % 24) * 60 + m };
}

/** Whole days from `from` to `to`, both YYYY-MM-DD. */
export function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** "Today", "Tomorrow", or "in 4 days" for an upcoming date. */
export function relativeDay(iso: string, today: string) {
  const days = daysBetween(today, iso);
  return days <= 0 ? "Today" : days === 1 ? "Tomorrow" : `in ${days} days`;
}
