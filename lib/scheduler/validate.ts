/**
 * One validator for proposed schedule changes, composed from the existing checks: detectConflicts
 * (double booking, capacity, room type, availability, daily hours), checkSlot (allowed hours and room
 * windows), and the configured constraint rules. No rule logic lives here. Pure and browser-safe.
 */
import { detectConflicts, isOverlapConflict, type ConflictContext } from "./conflictDetector";
import { checkAll, checkEntry, type ConstraintContext, type ConstraintRule } from "./constraints";
import { checkSlot } from "./slot-check";
import type { SchedEntry, TimeRange } from "./types";

export interface ValidationWorld {
  conflicts: ConflictContext;
  rules: ConstraintRule[];
  ruleCtx: ConstraintContext;
  /** Grid hours a class must fit inside. */
  bounds: TimeRange;
}

export interface Finding {
  /** Hard findings can never be introduced by a fix; soft ones are only counted. */
  hard: boolean;
  /** Overlap findings are the double bookings shown as conflicts. */
  overlap: boolean;
  source: string;
  message: string;
  entryIds: string[];
}

type Entry = SchedEntry & { id: string };

function termsConcurrent(a: SchedEntry, b: SchedEntry, ranges?: ConflictContext["termRanges"]) {
  if (!ranges || !a.semesterId || !b.semesterId || a.semesterId === b.semesterId) return true;
  const ra = ranges.get(a.semesterId);
  const rb = ranges.get(b.semesterId);
  return !ra || !rb || (ra.start <= rb.end && rb.start <= ra.end);
}

/** Every finding for a whole set of classes: detector findings are hard, rules keep their own strength. */
export function validateSchedule(entries: Entry[], world: ValidationWorld): Finding[] {
  const detected = detectConflicts(entries, world.conflicts).map((c) => ({
    hard: true,
    overlap: isOverlapConflict(c),
    source: c.type,
    message: c.description,
    entryIds: [c.entryA.id, c.entryB?.id].filter((id): id is string => !!id),
  }));
  const ruled = checkAll(entries, world.rules, world.ruleCtx).map((v) => ({ hard: v.hard, overlap: false, source: v.kind, message: v.message, entryIds: v.entryIds }));
  return [...detected, ...ruled];
}

/**
 * Findings one class causes among the others. Only classes that share its faculty, room, or section on
 * the same day (or its faculty during the week, for load rules) can be involved, so only those are checked.
 */
export function validatePlacement(entry: Entry, others: Entry[], world: ValidationWorld): Finding[] {
  const rest = others.filter((o) => o.id !== entry.id && termsConcurrent(o, entry, world.conflicts.termRanges));
  const sameDay = rest.filter((o) => o.dayOfWeek === entry.dayOfWeek && (o.facultyId === entry.facultyId || o.roomId === entry.roomId || o.sectionId === entry.sectionId));
  const involved = (ids: (string | undefined)[]) => ids.includes(entry.id);

  const detected = detectConflicts([entry, ...sameDay], world.conflicts)
    .filter((c) => involved([c.entryA.id, c.entryB?.id]) || (c.type === "DAILY_HOURS_CONFLICT" && c.entryA.facultyId === entry.facultyId))
    .map((c) => ({ hard: true, overlap: isOverlapConflict(c), source: c.type, message: c.description, entryIds: [c.entryA.id, c.entryB?.id].filter((id): id is string => !!id) }));

  const bounded = checkSlot(entry, [], { room: world.conflicts.roomById.get(entry.roomId), bounds: world.bounds })
    .filter((r) => r === "Outside allowed hours")
    .map((r) => ({ hard: true, overlap: false, source: "OUTSIDE_HOURS", message: `${r}: the class must fit the room's hours and the timetable grid.`, entryIds: [entry.id] }));

  const ruleOthers = rest.filter((o) => o.dayOfWeek === entry.dayOfWeek || o.facultyId === entry.facultyId);
  const ruled = checkEntry(entry, ruleOthers, world.rules, world.ruleCtx).map((v) => ({ hard: v.hard, overlap: false, source: v.kind, message: v.message, entryIds: [entry.id] }));

  return [...detected, ...bounded, ...ruled];
}

/** True when a placement adds no hard finding. */
export const placementAllowed = (findings: Finding[]) => !findings.some((f) => f.hard);
export const softCount = (findings: Finding[]) => findings.filter((f) => !f.hard).length;
