import { EMPTY_POLICY_TARGET, DELIVERY_LABELS, hoursLabel, policyTargetSchema, type ClassDeliveryMode } from "@/lib/scheduler/class-policies";
import { gradeLabel, levelLabel, yearLabel } from "@/lib/academics/levels";
import { availableDaysOf, CONSTRAINT_INFO, type ConstraintKind } from "@/lib/scheduler/constraints";
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

export const CREATE_CATEGORIES: { value: CreateCategory; label: string; short: string; description: string; kinds: ConstraintKind[] }[] = [
  { value: "faculty", label: "Faculty rule", short: "Faculty", description: "Teaching load, back-to-back classes, or gaps for every faculty member.", kinds: ["MAX_TEACHING_LOAD", "MAX_CONSECUTIVE", "MINIMUM_GAP"] },
  { value: "preference", label: "Individual faculty preference", short: "Preference", description: "Days and hours a part-time faculty member attends.", kinds: ["PREFERRED_TIME"] },
  { value: "schedule", label: "Schedule rule", short: "Schedule", description: "Duration, delivery mode, breaks, section gaps, and subject time of day.", kinds: ["LUNCH_BREAK", "MAX_CONSECUTIVE", "MINIMUM_GAP", "SUBJECT_TIME_OF_DAY", "CLASS_DURATION", "DELIVERY_MODE"] },
  { value: "rooms", label: "Room rule", short: "Rooms", description: "Room priority, capacity, and designation.", kinds: ["ROOM_PRIORITY", "ROOM_CAPACITY", "ROOM_DESIGNATION"] },
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
    case "ROOM_PRIORITY":
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
  CLASS_DURATION: { target: EMPTY_POLICY_TARGET, allowedMinutes: [60, 90, 180], allowFinalRemainder: true },
  DELIVERY_MODE: { target: EMPTY_POLICY_TARGET, allowedModes: ["IN_PERSON", "ONLINE_LIVE"], defaultMode: "IN_PERSON" },
  NO_DOUBLE_BOOKING: {},
  ROOM_CAPACITY: {},
  ROOM_DESIGNATION: {},
  MAX_TEACHING_LOAD: { maxDailyHours: 8, maxWeeklyHours: 24 },
  PREFERRED_TIME: { facultyId: "", startMin: 8 * 60, endMin: 17 * 60, availableDays: [] },
  MAX_CONSECUTIVE: { maxConsecutive: 3, appliesTo: "FACULTY" },
  LUNCH_BREAK: { startMin: 12 * 60, endMin: 13 * 60 },
  SUBJECT_TIME_OF_DAY: { subjectId: "", period: "MORNING" },
  MINIMUM_GAP: { minutes: 15, appliesTo: "SECTION" },
  ROOM_PRIORITY: { roomId: "", facultyId: "" },
};

const n = (v: unknown) => Number(v);
const range = (p: Params) => `${formatTime(n(p.startMin))}–${formatTime(n(p.endMin))}`;
const availableDays = (p: Params) => availableDaysOf(p).map((d) => DAY_LONG[d as keyof typeof DAY_LONG]).join(", ");

/** Settings as short chips, e.g. "8 hours a day" or "12:00 PM–1:00 PM". */
export function settingChips(kind: ConstraintKind, p: Params, names: Map<string, string>): string[] {
  switch (kind) {
    case "CLASS_DURATION":
    case "DELIVERY_MODE": {
      const target = policyTargetSchema.parse(p.target ?? {});
      const filters = [...target.sectionIds.map((id) => names.get(id) ?? "Selected section"), target.termId && (names.get(target.termId) ?? "Selected term"), target.level && levelLabel(target.level), target.programId && (names.get(target.programId) ?? "Selected program"), target.yearLevel && yearLabel(target.yearLevel), target.gradeLevel && gradeLabel(target.gradeLevel), target.sectionId && (names.get(target.sectionId) ?? "Selected section"), target.subjectId && (names.get(target.subjectId) ?? "Selected subject"), target.classId && (names.get(target.classId) ?? "Selected meeting"), target.subjectCategory && `${target.subjectCategory === "MINOR" ? "Minor" : "Major"} subjects`, target.component && (target.component === "LECTURE" ? "Lecture" : "Laboratory")].filter(Boolean) as string[];
      const settings = kind === "CLASS_DURATION" ? [(p.allowedMinutes as number[]).map(hoursLabel).join(" / "), ...(p.allowFinalRemainder ? ["Final remainder allowed"] : [])] : [(p.allowedModes as ClassDeliveryMode[]).map((m) => DELIVERY_LABELS[m]).join(" / "), `Default: ${DELIVERY_LABELS[p.defaultMode as ClassDeliveryMode]}`];
      return [...settings, ...(filters.length ? filters : ["All classes"])];
    }
    case "MAX_TEACHING_LOAD":
      return [`${n(p.maxDailyHours)} hours a day`, `${n(p.maxWeeklyHours)} hours a week`];
    case "PREFERRED_TIME":
      return [availableDays(p), range(p)];
    case "MAX_CONSECUTIVE":
      return [`Maximum ${n(p.maxConsecutive)} in a row`];
    case "LUNCH_BREAK":
      return [range(p)];
    case "SUBJECT_TIME_OF_DAY":
      return [names.get(String(p.subjectId)) ?? "Subject", p.period === "MORNING" ? "Morning" : "Afternoon"];
    case "MINIMUM_GAP":
      return [`${n(p.minutes)}-minute gap`];
    case "ROOM_PRIORITY":
      return [names.get(String(p.roomId)) ?? "Room", names.get(String(p.facultyId)) ?? "Faculty member"];
    default:
      return [];
  }
}

/** Full sentence for a rule's settings, shown in the tooltip. */
export function summary(kind: ConstraintKind, p: Params, names: Map<string, string>) {
  const who = p.appliesTo === "FACULTY" ? "each faculty member" : "each section";
  switch (kind) {
    case "CLASS_DURATION":
    case "DELIVERY_MODE":
      return settingChips(kind, p, names).join(" ? ");
    case "MAX_TEACHING_LOAD":
      return `At most ${n(p.maxDailyHours)} hours a day and ${n(p.maxWeeklyHours)} hours a week.`;
    case "PREFERRED_TIME":
      return `${names.get(String(p.facultyId)) ?? "Faculty member"}: ${formatTime(n(p.startMin))} to ${formatTime(n(p.endMin))} on ${availableDays(p)}.`;
    case "MAX_CONSECUTIVE":
      return `At most ${n(p.maxConsecutive)} back-to-back classes for ${who}.`;
    case "LUNCH_BREAK":
      return `No class from ${formatTime(n(p.startMin))} to ${formatTime(n(p.endMin))}.`;
    case "SUBJECT_TIME_OF_DAY":
      return `${names.get(String(p.subjectId)) ?? "Subject"} in the ${p.period === "MORNING" ? "morning" : "afternoon"}.`;
    case "ROOM_PRIORITY":
      return `${names.get(String(p.facultyId)) ?? "Faculty member"} gets ${names.get(String(p.roomId)) ?? "the room"} first.`;
    case "MINIMUM_GAP":
      return `At least ${n(p.minutes)} minutes between classes of ${who}.`;
    default:
      return CONSTRAINT_INFO[kind].description;
  }
}
