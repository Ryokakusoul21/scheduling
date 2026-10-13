/** Comparisons and weekly series for the Administrator analytics (pure; tests/analytics.test.ts). */
import { addDays } from "@/lib/occupancy/engine";
import { startOfWeek } from "@/lib/calendar";

export interface Change {
  /** Percent change for counts, percentage points for rates; null when the previous semester has no data. */
  value: number | null;
  unit: "percent" | "points";
  /** Whether going up is good news for this measure (conflicts and overloads are better when lower). */
  upIsGood: boolean;
}

export function countChange(current: number, previous: number | null, upIsGood = true): Change {
  const value = previous === null || previous === 0 ? null : Math.round(((current - previous) / previous) * 1000) / 10;
  return { value, unit: "percent", upIsGood };
}

export function rateChange(current: number, previous: number | null, upIsGood = true): Change {
  return { value: previous === null ? null : Math.round((current - previous) * 10) / 10, unit: "points", upIsGood };
}

/** Counts dated items per Monday-to-Sunday week between two dates (inclusive). */
export function weeklyCounts(from: string, to: string, series: Record<string, string[]>) {
  const weeks: string[] = [];
  for (let w = startOfWeek(from); w <= to; w = addDays(w, 7)) weeks.push(w);
  return weeks.map((week) => {
    const end = addDays(week, 6);
    const row: Record<string, string | number> = { week };
    for (const [name, dates] of Object.entries(series)) row[name] = dates.filter((d) => d >= week && d <= end).length;
    return row;
  });
}

/** Indexes of the most and least used items among those with any capacity (both empty when fewer than two). */
export function extremes(rates: { rate: number; capacityHours: number }[]) {
  const usable = rates.map((r, i) => ({ ...r, i })).filter((r) => r.capacityHours > 0);
  if (usable.length < 2) return { most: -1, least: -1 };
  const sorted = [...usable].sort((a, b) => b.rate - a.rate);
  return { most: sorted[0].i, least: sorted[sorted.length - 1].i };
}
