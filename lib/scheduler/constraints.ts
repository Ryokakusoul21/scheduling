import { roomAllowsSection, type RoomDesignation } from "@/lib/rooms/designation";
/**
 * Scheduling constraints: hard rules block saving, soft rules warn and can be overridden.
 * Pure and browser-safe; the server loads the rules and context (see constraints-server.ts).
 */
import { z } from "zod";
import { durationPolicySchema, deliveryPolicySchema, hoursLabel, policyMatches } from "./class-policies";
import { rangesOverlap, type DayOfWeek, type SchedEntry } from "./types";

export type ConstraintKind =
  | "NO_DOUBLE_BOOKING"
  | "ROOM_CAPACITY"
  | "ROOM_DESIGNATION"
  | "MAX_TEACHING_LOAD"
  | "PREFERRED_TIME"
  | "MAX_CONSECUTIVE"
  | "LUNCH_BREAK"
  | "SUBJECT_TIME_OF_DAY"
  | "MINIMUM_GAP"
  | "CLASS_DURATION"
  | "DELIVERY_MODE"
  | "ROOM_PRIORITY";

const DAY = z.enum(["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"]);

/** Days a part-time faculty member attends; older rules that stored days off mean every other day. */
export function availableDaysOf(p: Record<string, unknown>): DayOfWeek[] {
  if (Array.isArray(p.availableDays)) return p.availableDays as DayOfWeek[];
  const off = Array.isArray(p.daysOff) ? (p.daysOff as string[]) : [];
  return DAY.options.filter((d) => d !== "SUNDAY" && !off.includes(d));
}
const MINUTE = z.number().int().min(0).max(24 * 60);
const APPLIES_TO = z.enum(["FACULTY", "SECTION"]);
const empty = z.object({});

/** Parameters each kind accepts; validated on save and again before checking. */
export const PARAM_SCHEMAS = {
  CLASS_DURATION: durationPolicySchema,
  DELIVERY_MODE: deliveryPolicySchema,
  NO_DOUBLE_BOOKING: empty,
  ROOM_CAPACITY: empty,
  ROOM_DESIGNATION: empty,
  MAX_TEACHING_LOAD: z.object({
    maxDailyHours: z.number().positive().max(24),
    maxWeeklyHours: z.number().positive().max(168),
  }),
  // Older rules stored days off; they are read as every other day being available.
  PREFERRED_TIME: z.preprocess(
    (v) => (v && typeof v === "object" && !("availableDays" in v) && "daysOff" in v ? { ...v, availableDays: DAY.options.filter((d) => d !== "SUNDAY" && !(v.daysOff as string[]).includes(d)) } : v),
    z.object({ facultyId: z.string().min(1, "Choose a faculty member"), startMin: MINUTE, endMin: MINUTE, availableDays: z.array(DAY).min(1, "Choose at least one day they attend") }).strip(),
  )
    .refine((p) => p.endMin > p.startMin, { message: "The preferred end time must be after the start time", path: ["endMin"] }),
  MAX_CONSECUTIVE: z.object({ maxConsecutive: z.number().int().min(1).max(12), appliesTo: APPLIES_TO }),
  LUNCH_BREAK: z
    .object({ startMin: MINUTE, endMin: MINUTE })
    .refine((p) => p.endMin > p.startMin, { message: "The lunch break must end after it starts", path: ["endMin"] }),
  SUBJECT_TIME_OF_DAY: z.object({ subjectId: z.string().min(1, "Choose a subject"), period: z.enum(["MORNING", "AFTERNOON"]) }),
  MINIMUM_GAP: z.object({ minutes: z.number().int().min(5).max(240), appliesTo: APPLIES_TO }),
  ROOM_PRIORITY: z.object({ roomId: z.string().min(1, "Choose a room"), facultyId: z.string().min(1, "Choose a faculty member") }),
} satisfies Record<ConstraintKind, z.ZodType>;

export type ConstraintParams<K extends ConstraintKind> = z.infer<(typeof PARAM_SCHEMAS)[K]>;

export const CONSTRAINT_INFO: Record<ConstraintKind, { label: string; hard: boolean; description: string }> = {
  CLASS_DURATION: { label: "Class meeting duration", hard: true, description: "Allowed meeting lengths for selected terms, years, sections, subjects, or classes." },
  DELIVERY_MODE: { label: "Class delivery mode", hard: true, description: "Allowed delivery modes for selected years, sections, subjects, minor subjects, or individual classes." },
  NO_DOUBLE_BOOKING: { label: "No double-booking", hard: true, description: "A faculty member, room, or section is never in two classes at once. Always enforced." },
  ROOM_CAPACITY: { label: "Room capacity fits the section", hard: true, description: "The room has at least as many seats as the section has students." },
  ROOM_DESIGNATION: { label: "Room matches department", hard: true, description: "A section only uses rooms designated for its department, or General / Shared rooms." },
  MAX_TEACHING_LOAD: { label: "Maximum teaching load", hard: true, description: "A faculty member does not teach more than the daily and weekly hour limits." },
  PREFERRED_TIME: { label: "Part-time faculty available days and hours", hard: false, description: "Classes of the part-time faculty member fall on their available days, inside their hours." },
  MAX_CONSECUTIVE: { label: "Maximum consecutive classes", hard: false, description: "No more than the set number of back-to-back classes." },
  LUNCH_BREAK: { label: "Lunch break protection", hard: false, description: "No class overlaps the lunch break." },
  SUBJECT_TIME_OF_DAY: { label: "Subject preferred time of day", hard: false, description: "The subject is taught in the morning or in the afternoon." },
  MINIMUM_GAP: { label: "Minimum gap between classes", hard: false, description: "At least the set number of minutes between two classes." },
  ROOM_PRIORITY: { label: "Room priority", hard: false, description: "The faculty member gets this room first; others use it when it is free." },
};

export const CONSTRAINT_KINDS = Object.keys(CONSTRAINT_INFO) as ConstraintKind[];

/** Kinds that cannot be disabled or deleted because the system prevents them at all times. */
export const LOCKED_KINDS: ConstraintKind[] = ["NO_DOUBLE_BOOKING"];

/** Rooms a faculty member has priority on (Room priority rules) placed ahead of their own preferences. */
export function withPriorityRooms(facultyId: string, preferred: string[], rules: Pick<ConstraintRule, "kind" | "params">[]) {
  const priority = rules.flatMap((r) => {
    if (r.kind !== "ROOM_PRIORITY") return [];
    const p = PARAM_SCHEMAS.ROOM_PRIORITY.safeParse(r.params);
    return p.success && p.data.facultyId === facultyId ? [p.data.roomId] : [];
  });
  return [...new Set([...priority, ...preferred])];
}

/** Classes this close together (in minutes) count as back-to-back. */
const BACK_TO_BACK_MINUTES = 10;
const NOON = 12 * 60;

export interface ConstraintRule {
  id: string;
  kind: ConstraintKind;
  name: string;
  params: unknown;
  departmentId: string | null;
}

export interface ConstraintContext {
  rooms: Map<string, { name: string; capacity: number; isGeneralShared: boolean; programIds: string[] } & RoomDesignation>;
  sections: Map<string, { name: string; studentCount: number; programId: string | null; departmentId: string | null; level?: string; yearLevel?: string | null; gradeLevel?: string | null }>;
  subjects: Map<string, { code: string; name: string; category?: string; lectureHours?: number; labHours?: number }>;
  faculty: Map<string, { name: string }>;
  programNames: Map<string, string>;
}

export interface Violation {
  constraintId: string;
  constraintName: string;
  kind: ConstraintKind;
  hard: boolean;
  message: string;
  entryIds: string[];
}

type Entry = SchedEntry & { id?: string };

const DAY_NAMES: Record<DayOfWeek, string> = {
  MONDAY: "Monday", TUESDAY: "Tuesday", WEDNESDAY: "Wednesday", THURSDAY: "Thursday", FRIDAY: "Friday", SATURDAY: "Saturday", SUNDAY: "Sunday",
};

function clock(min: number) {
  const h = Math.floor(min / 60);
  return `${((h + 11) % 12) + 1}:${String(min % 60).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

function hours(min: number) {
  return `${Math.round((min / 60) * 10) / 10} hours`;
}

function label(e: Entry, ctx: ConstraintContext) {
  return `${ctx.subjects.get(e.subjectId)?.code ?? "Class"} ${ctx.sections.get(e.sectionId)?.name ?? ""}`.trim();
}

function ownerKey(e: Entry, appliesTo: "FACULTY" | "SECTION") {
  return appliesTo === "FACULTY" ? e.facultyId : e.sectionId;
}

/** A rule applies to a class when it covers every department or the class section's department. */
function applies(rule: ConstraintRule, e: Entry, ctx: ConstraintContext) {
  return !rule.departmentId || ctx.sections.get(e.sectionId)?.departmentId === rule.departmentId;
}

/** Same-day classes of one owner sorted by start, with the candidate included. */
function dayLine(e: Entry, sameDay: Entry[], key: (x: Entry) => string) {
  return [e, ...sameDay.filter((o) => key(o) === key(e))].sort((a, b) => a.startMin - b.startMin);
}

/** Evaluates one rule for one class against the other classes on the same day. */
function evaluate(rule: ConstraintRule, e: Entry, sameDay: Entry[], weeklyMinutes: number, ctx: ConstraintContext, allOthers: Entry[] = sameDay): string[] {
  const parsed = PARAM_SCHEMAS[rule.kind].safeParse(rule.params);
  if (!parsed.success) return [];
  const p = parsed.data as Record<string, never>;
  const me = label(e, ctx);
  const day = DAY_NAMES[e.dayOfWeek];

  switch (rule.kind) {
    case "NO_DOUBLE_BOOKING":
      return sameDay
        .filter((o) => rangesOverlap(o, e))
        .flatMap((o) => {
          const shared = [o.facultyId === e.facultyId && "faculty member", !!e.roomId && o.roomId === e.roomId && "room", o.sectionId === e.sectionId && "section"].filter(Boolean);
          const pair = [me, label(o, ctx)].sort().join(" and ");
          return shared.length ? [`${pair} share the same ${shared.join(", ")} on ${day} at an overlapping time.`] : [];
        });
    case "CLASS_DURATION": {
      if (!policyMatches(rule, e, ctx.sections.get(e.sectionId), ctx.subjects.get(e.subjectId))) return [];
      const params = durationPolicySchema.parse(rule.params);
      const minutes = e.endMin - e.startMin;
      if (params.allowedMinutes.includes(minutes)) return [];
      const subject = ctx.subjects.get(e.subjectId);
      const required = (e.component === "LECTURE" ? subject?.lectureHours : subject?.labHours) ?? 0;
      const used = allOthers.filter((o) => o.sectionId === e.sectionId && o.subjectId === e.subjectId && o.component === e.component && o.semesterId === e.semesterId).reduce((sum, o) => sum + o.endMin - o.startMin, 0);
      if (params.allowFinalRemainder && minutes < Math.min(...params.allowedMinutes) && minutes === Math.round(required * 60) - used) return [];
      return [`${me}: meeting length must be ${params.allowedMinutes.map(hoursLabel).join(" or ")} (${rule.name}).`];
    }
    case "DELIVERY_MODE": {
      if (!policyMatches(rule, e, ctx.sections.get(e.sectionId), ctx.subjects.get(e.subjectId))) return [];
      const params = deliveryPolicySchema.parse(rule.params);
      return params.allowedModes.includes((e.deliveryMode ?? "IN_PERSON") as "IN_PERSON" | "ONLINE_LIVE") ? [] : [`${me}: delivery mode must follow ${rule.name}.`];
    }
    case "ROOM_CAPACITY": {
      if (e.deliveryMode === "ONLINE_LIVE") return [];
      const room = ctx.rooms.get(e.roomId);
      const size = ctx.sections.get(e.sectionId)?.studentCount ?? 0;
      return room && size > room.capacity ? [`${me}: ${room.name} seats ${room.capacity}, but the section has ${size} students.`] : [];
    }
    case "ROOM_DESIGNATION": {
      if (e.deliveryMode === "ONLINE_LIVE") return [];
      const room = ctx.rooms.get(e.roomId);
      const section = ctx.sections.get(e.sectionId);
      if (!room || roomAllowsSection({ ...room, programIds: room.isGeneralShared ? null : room.programIds }, section ?? {})) return [];
      return [`${me}: ${room.name} is designated for another department.`];
    }
    case "MAX_TEACHING_LOAD": {
      const daily = dayLine(e, sameDay, (x) => x.facultyId).reduce((s, x) => s + x.endMin - x.startMin, 0);
      const name = ctx.faculty.get(e.facultyId)?.name ?? "The faculty member";
      const out: string[] = [];
      if (daily > p.maxDailyHours * 60) out.push(`${name} would teach ${hours(daily)} on ${day} (limit ${p.maxDailyHours} hours) including ${me}.`);
      if (weeklyMinutes > p.maxWeeklyHours * 60) out.push(`${name} would teach ${hours(weeklyMinutes)} a week (limit ${p.maxWeeklyHours} hours) including ${me}.`);
      return out;
    }
    case "PREFERRED_TIME": {
      if (e.facultyId !== p.facultyId) return [];
      const name = ctx.faculty.get(e.facultyId)?.name ?? "The faculty member";
      if (!availableDaysOf(p).includes(e.dayOfWeek)) return [`${me} falls on ${day}, not an available day of ${name}.`];
      if (e.startMin < p.startMin || e.endMin > p.endMin) return [`${me} is outside the preferred hours of ${name} (${clock(p.startMin)} to ${clock(p.endMin)}).`];
      return [];
    }
    case "MAX_CONSECUTIVE": {
      const line = dayLine(e, sameDay, (x) => ownerKey(x, p.appliesTo));
      let run = 1;
      let best = 1;
      let containsMe = false;
      for (let i = 0; i < line.length; i++) {
        if (i > 0 && line[i].startMin - line[i - 1].endMin <= BACK_TO_BACK_MINUTES) run++;
        else {
          run = 1;
          containsMe = false;
        }
        containsMe ||= line[i] === e;
        if (containsMe) best = Math.max(best, run);
      }
      const who = p.appliesTo === "FACULTY" ? ctx.faculty.get(e.facultyId)?.name : `Section ${ctx.sections.get(e.sectionId)?.name}`;
      return best > p.maxConsecutive ? [`${who} would have ${best} back-to-back classes on ${day} including ${me} (limit ${p.maxConsecutive}).`] : [];
    }
    case "LUNCH_BREAK":
      return rangesOverlap(e, { startMin: p.startMin, endMin: p.endMin })
        ? [`${me} on ${day} overlaps the lunch break (${clock(p.startMin)} to ${clock(p.endMin)}).`]
        : [];
    case "SUBJECT_TIME_OF_DAY": {
      if (e.subjectId !== p.subjectId) return [];
      const ok = p.period === "MORNING" ? e.endMin <= NOON : e.startMin >= NOON;
      return ok ? [] : [`${me} should be taught in the ${p.period === "MORNING" ? "morning" : "afternoon"}.`];
    }
    case "ROOM_PRIORITY":
      // Guides placement only; using the room for someone else is never a violation.
      return [];
    case "MINIMUM_GAP": {
      const line = dayLine(e, sameDay, (x) => ownerKey(x, p.appliesTo));
      const i = line.indexOf(e);
      return [line[i - 1], line[i + 1]]
        .filter((o): o is Entry => !!o && !rangesOverlap(o, e))
        .filter((o) => Math.abs(o.startMin < e.startMin ? e.startMin - o.endMin : o.startMin - e.endMin) < p.minutes)
        .map((o) => `${[me, label(o, ctx)].sort().join(" and ")} on ${day} are less than ${p.minutes} minutes apart.`);
    }
  }
}

function sameEntry(a: Entry, b: Entry) {
  return a === b || (!!a.id && a.id === b.id);
}

function runRules(rules: ConstraintRule[], e: Entry, others: Entry[], ctx: ConstraintContext): Violation[] {
  const sameDay = others.filter((o) => o.dayOfWeek === e.dayOfWeek && !sameEntry(o, e));
  const weekly = [e, ...others.filter((o) => o.facultyId === e.facultyId && !sameEntry(o, e))].reduce((s, x) => s + x.endMin - x.startMin, 0);
  return rules
    .filter((r) => applies(r, e, ctx))
    .flatMap((r) =>
      evaluate(r, e, sameDay, weekly, ctx, others.filter((o) => !sameEntry(o, e))).map((message) => ({
        constraintId: r.id,
        constraintName: r.name,
        kind: r.kind,
        hard: CONSTRAINT_INFO[r.kind].hard,
        message,
        entryIds: e.id ? [e.id] : [],
      }))
    );
}

/** Violations caused by placing one class among the others (the class itself is skipped if listed). */
export function checkEntry(entry: Entry, others: Entry[], rules: ConstraintRule[], ctx: ConstraintContext) {
  return runRules(rules, entry, others, ctx);
}

/** Every violation in a set of classes, merged so pairwise and per-day findings appear once. */
export function checkAll(entries: Entry[], rules: ConstraintRule[], ctx: ConstraintContext): Violation[] {
  const byDay = new Map<DayOfWeek, Entry[]>();
  const byFaculty = new Map<string, Entry[]>();
  for (const e of entries) {
    byDay.set(e.dayOfWeek, [...(byDay.get(e.dayOfWeek) ?? []), e]);
    byFaculty.set(e.facultyId, [...(byFaculty.get(e.facultyId) ?? []), e]);
  }
  const merged = new Map<string, Violation>();
  for (const e of entries) {
    // Same-day classes plus the rest of the faculty member's week is all any rule needs.
    const others = [...new Set([...(byDay.get(e.dayOfWeek) ?? []), ...(byFaculty.get(e.facultyId) ?? [])])];
    for (const v of runRules(rules, e, others, ctx)) {
      const key = `${v.constraintId}|${v.message.replace(/ including .*$/, "")}`;
      const found = merged.get(key);
      if (found) found.entryIds = [...new Set([...found.entryIds, ...v.entryIds])];
      else merged.set(key, v);
    }
  }
  return [...merged.values()].sort((a, b) => Number(b.hard) - Number(a.hard) || a.constraintName.localeCompare(b.constraintName));
}
