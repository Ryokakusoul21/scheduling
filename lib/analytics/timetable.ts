/**
 * Timetable analytics: Room Utilization Rate, Faculty Utilization Rate, and the peak-hours heatmap.
 * Pure functions over weekly class meetings (tests/analytics.test.ts).
 */
import type { DayOfWeek } from "@/lib/scheduler/types";

export interface Meeting {
  roomId: string;
  facultyId: string;
  dayOfWeek: DayOfWeek;
  startMin: number;
  endMin: number;
}

export interface RateRow {
  id: string;
  name: string;
  group: string;
  usedHours: number;
  capacityHours: number;
  /** Percent, rounded to one decimal. */
  rate: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const pct = (used: number, cap: number) => (cap > 0 ? round1((used / cap) * 100) : 0);

/** Scheduled hours against each room's weekly available hours. */
export function roomUtilization(meetings: Meeting[], rooms: { id: string; name: string; building: string; availableHours: number }[]): RateRow[] {
  const used = new Map<string, number>();
  for (const m of meetings) used.set(m.roomId, (used.get(m.roomId) ?? 0) + (m.endMin - m.startMin) / 60);
  return rooms
    .map((r) => {
      const u = round1(used.get(r.id) ?? 0);
      return { id: r.id, name: r.name, group: r.building, usedHours: u, capacityHours: r.availableHours, rate: pct(u, r.availableHours) };
    })
    .sort((a, b) => b.rate - a.rate);
}

/** Assigned teaching hours against each faculty member's maximum weekly hours. */
export function facultyUtilization(meetings: Meeting[], faculty: { id: string; name: string; department: string; maxHours: number }[]): RateRow[] {
  const used = new Map<string, number>();
  for (const m of meetings) used.set(m.facultyId, (used.get(m.facultyId) ?? 0) + (m.endMin - m.startMin) / 60);
  return faculty
    .map((f) => {
      const u = round1(used.get(f.id) ?? 0);
      return { id: f.id, name: f.name, group: f.department, usedHours: u, capacityHours: f.maxHours, rate: pct(u, f.maxHours) };
    })
    .sort((a, b) => b.rate - a.rate);
}

/** Rolls rows up by group (building or department): total used over total capacity. */
export function byGroup(rows: RateRow[]): RateRow[] {
  const groups = new Map<string, { used: number; cap: number; count: number }>();
  for (const r of rows) {
    const g = groups.get(r.group) ?? { used: 0, cap: 0, count: 0 };
    groups.set(r.group, { used: g.used + r.usedHours, cap: g.cap + r.capacityHours, count: g.count + 1 });
  }
  return [...groups.entries()]
    .map(([name, g]) => ({ id: name, name, group: `${g.count}`, usedHours: round1(g.used), capacityHours: round1(g.cap), rate: pct(g.used, g.cap) }))
    .sort((a, b) => b.rate - a.rate);
}

export function overall(rows: RateRow[]) {
  const used = rows.reduce((s, r) => s + r.usedHours, 0);
  const cap = rows.reduce((s, r) => s + r.capacityHours, 0);
  return { usedHours: round1(used), capacityHours: round1(cap), rate: pct(used, cap) };
}

export const HEATMAP_DAYS: DayOfWeek[] = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
export const HEATMAP_HOURS = Array.from({ length: 14 }, (_, i) => 7 + i);

/** Number of class meetings in session during each day-and-hour cell. */
export function peakHeatmap(meetings: Meeting[]) {
  return HEATMAP_DAYS.map((day) =>
    HEATMAP_HOURS.map((h) => meetings.filter((m) => m.dayOfWeek === day && m.startMin < (h + 1) * 60 && m.endMin > h * 60).length)
  );
}
