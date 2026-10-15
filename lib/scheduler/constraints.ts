/**
 * Scheduling constraints: hard rules block saving, soft rules warn and can be overridden.
 * Pure and browser-safe; the server loads the rules and context (see constraints-server.ts).
 */
import { z } from "zod";
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
  | "MINIMUM_GAP";

const DAY = z.enum(["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"]);
const MINUTE = z.number().int().min(0).max(24 * 60);
const APPLIES_TO = z.enum(["FACULTY", "SECTION"]);
const empty = z.object({});

/** Parameters each kind accepts; validated on save and again before checking. */
export const PARAM_SCHEMAS = {
  NO_DOUBLE_BOOKING: empty,
  ROOM_CAPACITY: empty,
  ROOM_DESIGNATION: empty,
  MAX_TEACHING_LOAD: z.object({
    maxDailyHours: z.number().positive().max(24),
    maxWeeklyHours: z.number().positive().max(168),
  }),
  PREFERRED_TIME: z
    .object({ facultyId: z.string().min(1, "Choose a faculty member"), startMin: MINUTE, endMin: MINUTE, daysOff: z.array(DAY) })
    .refine((p) => p.endMin > p.startMin, { message: "The preferred end time must be after the start time", path: ["endMin"] }),
  MAX_CONSECUTIVE: z.object({ maxConsecutive: z.number().int().min(1).max(12), appliesTo: APPLIES_TO }),
  LUNCH_BREAK: z
    .object({ startMin: MINUTE, endMin: MINUTE })
    .refine((p) => p.endMin > p.startMin, { message: "The lunch break must end after it starts", path: ["endMin"] }),
  SUBJECT_TIME_OF_DAY: z.object({ subjectId: z.string().min(1, "Choose a subject"), period: z.enum(["MORNING", "AFTERNOON"]) }),
  MINIMUM_GAP: z.object({ minutes: z.number().int().min(5).max(240), appliesTo: APPLIES_TO }),
} satisfies Record<ConstraintKind, z.ZodType>;

export type ConstraintParams<K extends ConstraintKind> = z.infer<(typeof PARAM_SCHEMAS)[K]>;

export const CONSTRAINT_INFO: Record<ConstraintKind, { label: string; hard: boolean; description: string }> = {
  NO_DOUBLE_BOOKING: { label: "No double-booking", hard: true, description: "A faculty member, room, or section is never in two classes at once. Always enforced." },
  ROOM_CAPACITY: { label: "Room capacity fits the section", hard: true, description: "The room has at least as many seats as the section has students." },
  ROOM_DESIGNATION: { label: "Room matches program or strand", hard: true, description: "A section only uses rooms designated for its program or strand, or General / Shared rooms." },
  MAX_TEACHING_LOAD: { label: "Maximum teaching load", hard: true, description: "A faculty member does not teach more than the daily and weekly hour limits." },
  PREFERRED_TIME: { label: "Faculty preferred time and days off", hard: false, description: "Classes of the faculty member fall inside the preferred hours and avoid the days off." },
  MAX_CONSECUTIVE: { label: "Maximum consecutive classes", hard: false, description: "No more than the set number of back-to-back classes." },
  LUNCH_BREAK: { label: "Lunch break protection", hard: false, description: "No class overlaps the lunch break." },
  SUBJECT_TIME_OF_DAY: { label: "Subject preferred time of day", hard: false, description: "The subject is taught in the morning or in the afternoon." },
  MINIMUM_GAP: { label: "Minimum gap between classes", hard: false, description: "At least the set number of minutes between two classes." },
};

export const CONSTRAINT_KINDS = Object.keys(CONSTRAINT_INFO) as ConstraintKind[];

/** Kinds that cannot be disabled or deleted because the system prevents them at all times. */
export const LOCKED_KINDS: ConstraintKind[] = ["NO_DOUBLE_BOOKING"];

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
  rooms: Map<string, { name: string; capacity: number; isGeneralShared: boolean; programIds: string[] }>;
  sections: Map<string, { name: string; studentCount: number; programId: string | null; departmentId: string | null }>;
  subjects: Map<string, { code: string; name: string }>;
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
function evaluate(rule: ConstraintRule, e: Entry, sameDay: Entry[], weeklyMinutes: number, ctx: ConstraintContext): string[] {
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
          const shared = [o.facultyId === e.facultyId && "faculty member", o.roomId === e.roomId && "room", o.sectionId === e.sectionId && "section"].filter(Boolean);
          const pair = [me, label(o, ctx)].sort().join(" and ");
          return shared.length ? [`${pair} share the same ${shared.join(", ")} on ${day} at an overlapping time.`] : [];
        });
    case "ROOM_CAPACITY": {
      const room = ctx.rooms.get(e.roomId);
      const size = ctx.sections.get(e.sectionId)?.studentCount ?? 0;
      return room && size > room.capacity ? [`${me}: ${room.name} seats ${room.capacity}, but the section has ${size} students.`] : [];
    }
    case "ROOM_DESIGNATION": {
      const room = ctx.rooms.get(e.roomId);
      const programId = ctx.sections.get(e.sectionId)?.programId;
      if (!room || room.isGeneralShared || (programId && room.programIds.includes(programId))) return [];
      const allowed = room.programIds.map((id) => ctx.programNames.get(id) ?? id).join(", ") || "no program";
      return [`${me}: ${room.name} is designated for ${allowed}, not for this section's program or strand.`];
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
      if ((p.daysOff as DayOfWeek[]).includes(e.dayOfWeek)) return [`${me} falls on ${day}, a preferred day off of ${name}.`];
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
      evaluate(r, e, sameDay, weekly, ctx).map((message) => ({
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
