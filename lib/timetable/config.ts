import { z } from "zod";
import type { DayOfWeek } from "@/lib/scheduler/types";
import type { GridConfig } from "@/lib/scheduler/timetable";

export const TIMETABLE_DAYS: DayOfWeek[] = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"];
const daySchema = z.enum(["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"]);
const minute = z.number().int().min(0).max(1440);
const hoursSchema = z.object({ startMin: minute, endMin: minute }).refine((v) => v.endMin > v.startMin, "Closing time must follow opening time.");
export const timetableConfigSchema = z.object({
  mode: z.enum(["STATIC", "DYNAMIC"]),
  classSession: z.enum(["DEFAULT", "SPLIT_90", "BLOCK_180"]).default("DEFAULT"),
  days: z.array(daySchema).min(1, "Select at least one teaching day.").max(7),
  dayStart: minute, dayEnd: minute,
  gridInterval: z.union([z.literal(15), z.literal(30), z.literal(60)]),
  adjustmentStep: z.union([z.literal(5), z.literal(10), z.literal(15), z.literal(30)]),
  dayHours: z.partialRecord(daySchema, hoursSchema),
  breaks: z.array(z.object({ name: z.string().trim().min(1).max(60), days: z.array(daySchema).min(1).max(7), startMin: minute, endMin: minute })
    .refine((v) => v.endMin > v.startMin, "A break must end after it starts.")).max(12),
  hour12: z.boolean(), zoom: z.enum(["COMPACT", "STANDARD", "LARGE"]), autoFit: z.boolean(),
}).superRefine((v, ctx) => {
  if (v.dayEnd <= v.dayStart) ctx.addIssue({ code: "custom", message: "Closing time must follow opening time.", path: ["dayEnd"] });
  if (v.classSession === "SPLIT_90" && v.mode === "STATIC" && 90 % v.gridInterval !== 0) ctx.addIssue({ code: "custom", message: "1.5-hour meetings need a 15- or 30-minute fixed grid, or Dynamic time mode.", path: ["gridInterval"] });
  for (const [day, hours] of Object.entries(v.dayHours)) if (hours && (hours.startMin < v.dayStart || hours.endMin > v.dayEnd)) {
    ctx.addIssue({ code: "custom", message: `${day}: custom hours must fit inside the daily operating hours.`, path: ["dayHours", day] });
  }
});
export type TimetableConfig = z.infer<typeof timetableConfigSchema>;
export const DEFAULT_TIMETABLE: TimetableConfig = {
  mode: "STATIC", classSession: "DEFAULT", days: TIMETABLE_DAYS.slice(0, 6), dayStart: 420, dayEnd: 1140,
  gridInterval: 30, adjustmentStep: 5, dayHours: {}, breaks: [], hour12: true, zoom: "STANDARD", autoFit: false,
};
export interface TimetableBundle { school: TimetableConfig; overrides: Record<string, TimetableConfig> }
export const timetableScopeKey = (departmentId: string | null, termId: string | null) => termId ? `timetable:${termId}:${departmentId ?? "school"}` : "timetable:default";
export const timetableStep = (c: TimetableConfig) => c.mode === "STATIC" ? c.gridInterval : c.adjustmentStep;
export const timetableHours = (c: TimetableConfig, day: DayOfWeek) => c.dayHours[day] ?? { startMin: c.dayStart, endMin: c.dayEnd };

export function withinSchool(config: TimetableConfig, parent: TimetableConfig) {
  return config.days.every((day) => {
    const c = timetableHours(config, day), p = timetableHours(parent, day);
    return parent.days.includes(day) && c.startMin >= p.startMin && c.endMin <= p.endMin;
  });
}

/** Department rules may narrow school hours; school breaks always remain in force. */
function mergeBreaks(...groups: TimetableConfig["breaks"][]) {
  return [...new Map(groups.flat().map((b) => [JSON.stringify([b.name, [...b.days].sort(), b.startMin, b.endMin]), b])).values()];
}
export function timetableTicks(c: TimetableConfig, entries: { startMin: number; endMin: number }[]) {
  const grid = timetableGrid(c, entries), ticks = new Set([grid.dayStart, grid.dayEnd, ...entries.flatMap((e) => [e.startMin, e.endMin])]);
  for (let min = grid.dayStart; min < grid.dayEnd; min += grid.slot) ticks.add(min);
  return [...ticks].sort((a, b) => a - b);
}
export function effectiveTimetable(bundle: TimetableBundle | undefined, departmentId: string | null | undefined, termId: string | null | undefined): TimetableConfig {
  if (!bundle) return DEFAULT_TIMETABLE;
  const term = termId ? bundle.overrides[timetableScopeKey(null, termId)] : undefined;
  const parent = term && withinSchool(term, bundle.school) ? { ...term, breaks: mergeBreaks(bundle.school.breaks, term.breaks) } : bundle.school;
  const own = departmentId && termId ? bundle.overrides[timetableScopeKey(departmentId, termId)] : undefined;
  return own && withinSchool(own, parent) ? { ...own, breaks: mergeBreaks(parent.breaks, own.breaks) } : parent;
}

export function timetableTimeError(c: TimetableConfig, entry: { dayOfWeek: DayOfWeek; startMin: number; endMin: number }) {
  if (!c.days.includes(entry.dayOfWeek)) return "This day is not enabled in Timetable Configuration.";
  const hours = timetableHours(c, entry.dayOfWeek);
  if (entry.startMin < hours.startMin || entry.endMin > hours.endMin || entry.endMin <= entry.startMin) return "This time is outside the configured operating hours.";
  const step = timetableStep(c);
  if ((entry.startMin - hours.startMin) % step || (entry.endMin - hours.startMin) % step) return `Use ${step}-minute time boundaries from the configured opening time.`;
  const blocked = c.breaks.find((b) => b.days.includes(entry.dayOfWeek) && entry.startMin < b.endMin && b.startMin < entry.endMin);
  return blocked ? `This time overlaps the configured break: ${blocked.name}.` : null;
}

export function snapTimetableTime(value: number, c: TimetableConfig, day: DayOfWeek) {
  const origin = timetableHours(c, day).startMin, step = timetableStep(c);
  return origin + Math.round((value - origin) / step) * step;
}

export function timetableStarts(c: TimetableConfig, day: DayOfWeek, duration: number) {
  if (!c.days.includes(day)) return [];
  const hours = timetableHours(c, day), starts: number[] = [];
  for (let start = hours.startMin; start + duration <= hours.endMin; start += timetableStep(c)) {
    if (!timetableTimeError(c, { dayOfWeek: day, startMin: start, endMin: start + duration })) starts.push(start);
  }
  return starts;
}

/** Display bounds expand for old/off-grid records; configuration never clips or retimes them. */
export function timetableGrid(c: TimetableConfig, entries: { startMin: number; endMin: number }[] = []): GridConfig {
  const start = entries.length ? Math.min(...entries.map((e) => e.startMin)) : c.dayStart;
  const end = entries.length ? Math.max(...entries.map((e) => e.endMin)) : c.dayEnd;
  return {
    dayStart: c.autoFit && entries.length ? Math.floor(start / c.gridInterval) * c.gridInterval : Math.min(c.dayStart, start),
    dayEnd: c.autoFit && entries.length ? Math.min(1440, Math.ceil(end / c.gridInterval) * c.gridInterval) : Math.max(c.dayEnd, end),
    slot: c.gridInterval, rowHeight: c.zoom === "COMPACT" ? 22 : c.zoom === "LARGE" ? 40 : 28,
    snapStep: timetableStep(c), hour12: c.hour12,
  };
}

export function timetableDisplayDays(c: TimetableConfig, entries: { dayOfWeek: DayOfWeek }[]) {
  return TIMETABLE_DAYS.filter((d) => c.days.includes(d) || entries.some((e) => e.dayOfWeek === d));
}
export const timeInputValue = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
export const timeInputMinutes = (value: string) => { const [h, m] = value.split(":").map(Number); return h * 60 + m; };
