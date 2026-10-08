/**
 * Pure helpers for the Scheduler timetable: grid geometry, snapping, lane
 * layout for overlapping blocks, and "what still needs scheduling" maths.
 * Browser-safe and unit-tested (tests/timetable.test.ts).
 */
import type { DayOfWeek, DetectedConflict } from "./types";

export const WEEK_DAYS: DayOfWeek[] = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"];
export const DAY_SHORT: Record<DayOfWeek, string> = {
  MONDAY: "Mon",
  TUESDAY: "Tue",
  WEDNESDAY: "Wed",
  THURSDAY: "Thu",
  FRIDAY: "Fri",
  SATURDAY: "Sat",
  SUNDAY: "Sun",
};
export const DAY_LONG: Record<DayOfWeek, string> = {
  MONDAY: "Monday",
  TUESDAY: "Tuesday",
  WEDNESDAY: "Wednesday",
  THURSDAY: "Thursday",
  FRIDAY: "Friday",
  SATURDAY: "Saturday",
  SUNDAY: "Sunday",
};

export interface GridConfig {
  dayStart: number; // minutes from midnight
  dayEnd: number;
  slot: number; // minutes per row
  rowHeight: number; // px per row
}

export const DEFAULT_GRID: GridConfig = { dayStart: 7 * 60, dayEnd: 19 * 60, slot: 30, rowHeight: 28 };

export function gridHeight(g: GridConfig) {
  return ((g.dayEnd - g.dayStart) / g.slot) * g.rowHeight;
}

export function minutesToY(min: number, g: GridConfig) {
  return ((min - g.dayStart) / g.slot) * g.rowHeight;
}

/** Converts a pixel offset within a day column to a start time snapped to the slot size. */
export function yToMinutes(y: number, g: GridConfig) {
  const raw = g.dayStart + (y / g.rowHeight) * g.slot;
  return snap(raw, g.slot);
}

export function snap(min: number, step: number) {
  return Math.round(min / step) * step;
}

/** Keeps a class of `duration` minutes inside the visible day. */
export function clampStart(start: number, duration: number, g: GridConfig) {
  return Math.min(Math.max(start, g.dayStart), g.dayEnd - duration);
}

export function formatTime(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

export function formatRange(start: number, end: number) {
  return `${formatTime(start)} – ${formatTime(end)}`;
}

/** Time options for selects, every `step` minutes within the grid. */
export function timeOptions(g: GridConfig = DEFAULT_GRID, step = 30) {
  const out: { value: number; label: string }[] = [];
  for (let m = g.dayStart; m <= g.dayEnd; m += step) out.push({ value: m, label: formatTime(m) });
  return out;
}

export interface LaneBlock {
  id: string;
  startMin: number;
  endMin: number;
}

/**
 * Assigns side-by-side lanes to overlapping blocks in one day column
 * (classic interval partitioning). Blocks in the same overlap cluster share a
 * lane count so their widths line up.
 */
export function layoutLanes<T extends LaneBlock>(blocks: T[]): Map<string, { lane: number; lanes: number }> {
  const sorted = [...blocks].sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin || a.id.localeCompare(b.id));
  const result = new Map<string, { lane: number; lanes: number }>();
  let cluster: { id: string; lane: number }[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    const lanes = Math.max(1, laneEnds.length);
    for (const c of cluster) result.set(c.id, { lane: c.lane, lanes });
    cluster = [];
    laneEnds = [];
  };

  for (const b of sorted) {
    if (b.startMin >= clusterEnd) flush();
    let lane = laneEnds.findIndex((end) => end <= b.startMin);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(b.endMin);
    } else {
      laneEnds[lane] = b.endMin;
    }
    cluster.push({ id: b.id, lane });
    clusterEnd = Math.max(clusterEnd, b.endMin);
  }
  flush();
  return result;
}

export type Severity = "conflict" | "warning";

/** Per-entry conflict severity and messages, for highlighting blocks. */
export function indexConflicts(conflicts: DetectedConflict[], isOverlap: (c: DetectedConflict) => boolean) {
  const byEntry = new Map<string, { severity: Severity; messages: string[] }>();
  const add = (id: string | undefined, c: DetectedConflict) => {
    if (!id) return;
    const sev: Severity = isOverlap(c) ? "conflict" : "warning";
    const cur = byEntry.get(id) ?? { severity: sev, messages: [] };
    if (sev === "conflict") cur.severity = "conflict";
    cur.messages.push(c.description);
    byEntry.set(id, cur);
  };
  for (const c of conflicts) {
    add(c.entryA.id, c);
    add(c.entryB?.id, c);
  }
  return byEntry;
}

/** Default meeting length when a subject is dropped onto the grid. */
export function defaultDuration(component: "LECTURE" | "LABORATORY", level: string) {
  if (level === "COLLEGE") return component === "LABORATORY" ? 180 : 90;
  return component === "LABORATORY" ? 120 : 60;
}

export interface SubjectNeed {
  subjectId: string;
  sectionId: string;
  component: "LECTURE" | "LABORATORY";
  requiredMin: number;
  scheduledMin: number;
}

/**
 * Weekly minutes still to be placed per subject/component for a section,
 * given the subject's lecture/lab hours and the classes already scheduled.
 */
export function remainingNeeds(
  section: { id: string },
  subjects: { id: string; lectureHours: number; labHours: number }[],
  entries: { sectionId: string; subjectId: string; component: string; startMin: number; endMin: number }[]
): SubjectNeed[] {
  const out: SubjectNeed[] = [];
  for (const subject of subjects) {
    for (const [component, hours] of [
      ["LECTURE", subject.lectureHours],
      ["LABORATORY", subject.labHours],
    ] as const) {
      if (hours <= 0) continue;
      const scheduledMin = entries
        .filter((e) => e.sectionId === section.id && e.subjectId === subject.id && e.component === component)
        .reduce((sum, e) => sum + (e.endMin - e.startMin), 0);
      const requiredMin = Math.round(hours * 60);
      if (scheduledMin < requiredMin) {
        out.push({ subjectId: subject.id, sectionId: section.id, component, requiredMin, scheduledMin });
      }
    }
  }
  return out;
}

/** Whether a subject is part of a section's curriculum. */
export function subjectAppliesToSection(
  subject: { level: string; programId: string | null; yearLevel: string | null; gradeLevel: string | null },
  section: { level: string; programId: string | null; yearLevel: string | null; gradeLevel: string | null }
) {
  if (subject.level !== section.level) return false;
  if (subject.programId && subject.programId !== section.programId) return false;
  if (section.level === "COLLEGE") return !subject.yearLevel || subject.yearLevel === section.yearLevel;
  return !subject.gradeLevel || subject.gradeLevel === section.gradeLevel;
}
