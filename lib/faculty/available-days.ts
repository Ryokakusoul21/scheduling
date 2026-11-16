import type { DayOfWeek } from "@prisma/client";

export const WEEK_DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"] as const satisfies readonly DayOfWeek[];

/** Days a faculty member can teach: every day with an availability window (all days when none are set), minus the day off. */
export function availableDays(f: { dayOff: DayOfWeek | null; availability: { dayOfWeek: DayOfWeek }[] }): DayOfWeek[] {
  const open = new Set(f.availability.map((a) => a.dayOfWeek));
  return WEEK_DAYS.filter((d) => d !== f.dayOff && (open.size === 0 || open.has(d)));
}
