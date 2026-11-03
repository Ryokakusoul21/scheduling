import { CONSTRAINT_INFO, type ConstraintKind } from "@/lib/scheduler/constraints";
import { DAY_LONG, formatTime } from "@/lib/scheduler/timetable";

export type Params = Record<string, unknown>;
export type Category = "faculty" | "schedule" | "rooms";
/** Dialog choices: a faculty rule, an individual preference, a schedule rule, or a room rule. */
export type CreateCategory = Category | "preference";

export interface ConstraintRow {
  id: string;
  kind: ConstraintKind;
  name: string;
  params: Params;
  enabled: boolean;
  departmentId: string | null;
  department: string;
  editable: boolean;
}

export const CATEGORIES: { value: Category; label: string }[] = [
  { value: "faculty", label: "Faculty rules" },
  { value: "schedule", label: "Schedule rules" },
  { value: "rooms", label: "Rooms and conflicts" },
];

export const CREATE_CATEGORIES: { value: CreateCategory; label: string; description: string; kinds: ConstraintKind[] }[] = [
  { value: "faculty", label: "Faculty rule", description: "Teaching load, back-to-back classes, or gaps for every faculty member.", kinds: ["MAX_TEACHING_LOAD", "MAX_CONSECUTIVE", "MINIMUM_GAP"] },
  { value: "preference", label: "Individual faculty preference", description: "Preferred hours and days off for one faculty member.", kinds: ["PREFERRED_TIME"] },
  { value: "schedule", label: "Schedule rule", description: "Lunch break, back-to-back classes or gaps per section, subject time of day.", kinds: ["LUNCH_BREAK", "MAX_CONSECUTIVE", "MINIMUM_GAP", "SUBJECT_TIME_OF_DAY"] },
  { value: "rooms", label: "Room rule", description: "Room capacity and room designation checks.", kinds: ["ROOM_CAPACITY", "ROOM_DESIGNATION"] },
];

/** Tab a rule belongs to; kinds with an "applies to" setting follow who they apply to. */
export function categoryOf(kind: ConstraintKind, params: Params): Category {
  switch (kind) {
    case "MAX_TEACHING_LOAD":
    case "PREFERRED_TIME":
      return "faculty";
    case "MAX_CONSECUTIVE":
    case "MINIMUM_GAP":
      return params.appliesTo === "FACULTY" ? "faculty" : "schedule";
    case "NO_DOUBLE_BOOKING":
    case "ROOM_CAPACITY":
    case "ROOM_DESIGNATION":
      return "rooms";
    default:
      return "schedule";
  }
}

/** Dialog category for an existing rule, so editing opens on the matching step. */
export function createCategoryOf(row: Pick<ConstraintRow, "kind" | "params">): CreateCategory {
  return row.kind === "PREFERRED_TIME" ? "preference" : categoryOf(row.kind, row.params);
}

/** Starting settings for a new constraint of each kind. */
export const DEFAULT_PARAMS: Record<ConstraintKind, Params> = {
  NO_DOUBLE_BOOKING: {},
  ROOM_CAPACITY: {},
  ROOM_DESIGNATION: {},
  MAX_TEACHING_LOAD: { maxDailyHours: 8, maxWeeklyHours: 24 },
  PREFERRED_TIME: { facultyId: "", startMin: 8 * 60, endMin: 17 * 60, daysOff: [] },
  MAX_CONSECUTIVE: { maxConsecutive: 3, appliesTo: "FACULTY" },
  LUNCH_BREAK: { startMin: 12 * 60, endMin: 13 * 60 },
  SUBJECT_TIME_OF_DAY: { subjectId: "", period: "MORNING" },
  MINIMUM_GAP: { minutes: 15, appliesTo: "SECTION" },
};

const n = (v: unknown) => Number(v);
const range = (p: Params) => `${formatTime(n(p.startMin))}–${formatTime(n(p.endMin))}`;
const daysOff = (p: Params) => ((p.daysOff as string[]) ?? []).map((d) => DAY_LONG[d as keyof typeof DAY_LONG]).join(", ");

/** Settings as short chips, e.g. "8 hours a day" or "12:00 PM–1:00 PM". */
export function settingChips(kind: ConstraintKind, p: Params, names: Map<string, string>): string[] {
  switch (kind) {
    case "MAX_TEACHING_LOAD":
      return [`${n(p.maxDailyHours)} hours a day`, `${n(p.maxWeeklyHours)} hours a week`];
    case "PREFERRED_TIME":
      return [`Available ${range(p)}`, ...(daysOff(p) ? [`Day off: ${daysOff(p)}`] : [])];
    case "MAX_CONSECUTIVE":
      return [`Maximum ${n(p.maxConsecutive)} in a row`];
    case "LUNCH_BREAK":
      return [range(p)];
    case "SUBJECT_TIME_OF_DAY":
      return [names.get(String(p.subjectId)) ?? "Subject", p.period === "MORNING" ? "Morning" : "Afternoon"];
    case "MINIMUM_GAP":
      return [`${n(p.minutes)}-minute gap`];
    default:
      return [];
  }
}

/** Full sentence for a rule's settings, shown in the tooltip. */
export function summary(kind: ConstraintKind, p: Params, names: Map<string, string>) {
  const who = p.appliesTo === "FACULTY" ? "each faculty member" : "each section";
  switch (kind) {
    case "MAX_TEACHING_LOAD":
      return `At most ${n(p.maxDailyHours)} hours a day and ${n(p.maxWeeklyHours)} hours a week.`;
    case "PREFERRED_TIME":
      return `${names.get(String(p.facultyId)) ?? "Faculty member"}: ${formatTime(n(p.startMin))} to ${formatTime(n(p.endMin))}${daysOff(p) ? `; days off ${daysOff(p)}` : ""}.`;
    case "MAX_CONSECUTIVE":
      return `At most ${n(p.maxConsecutive)} back-to-back classes for ${who}.`;
    case "LUNCH_BREAK":
      return `No class from ${formatTime(n(p.startMin))} to ${formatTime(n(p.endMin))}.`;
    case "SUBJECT_TIME_OF_DAY":
      return `${names.get(String(p.subjectId)) ?? "Subject"} in the ${p.period === "MORNING" ? "morning" : "afternoon"}.`;
    case "MINIMUM_GAP":
      return `At least ${n(p.minutes)} minutes between classes of ${who}.`;
    default:
      return CONSTRAINT_INFO[kind].description;
  }
}
