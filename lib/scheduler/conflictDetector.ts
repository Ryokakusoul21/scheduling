import {
  SchedEntry,
  SchedFaculty,
  SchedRoom,
  SchedSubject,
  DetectedConflict,
  ConflictSeverity,
  ConflictType,
  rangesOverlap,
} from "./types";

export interface ConflictContext {
  facultyById: Map<string, SchedFaculty>;
  roomById: Map<string, SchedRoom>;
  subjectById: Map<string, SchedSubject>;
  sectionStudentCountById: Map<string, number>;
  /**
   * Date range per term id. When given, two entries only clash if their terms
   * run at the same time (e.g. a College semester and an SHS quarter can overlap,
   * but Q1 and Q2 never do).
   */
  termRanges?: Map<string, { start: number; end: number }>;
}

function termsConcurrent(a: SchedEntry, b: SchedEntry, ranges?: ConflictContext["termRanges"]) {
  if (!ranges || !a.semesterId || !b.semesterId || a.semesterId === b.semesterId) return true;
  const ra = ranges.get(a.semesterId);
  const rb = ranges.get(b.semesterId);
  if (!ra || !rb) return true;
  return ra.start <= rb.end && rb.start <= ra.end;
}

/** Overlap conflicts (double bookings) are the ones shown in red; the rest are warnings. */
export function isOverlapConflict(c: DetectedConflict) {
  return c.type === "FACULTY_CONFLICT" || c.type === "ROOM_CONFLICT" || c.type === "SECTION_CONFLICT";
}

function push(
  out: DetectedConflict[],
  type: ConflictType,
  severity: ConflictSeverity,
  description: string,
  entryA: SchedEntry,
  entryB?: SchedEntry
) {
  out.push({ type, severity, description, entryA, entryB });
}

/**
 * Scans a set of schedule entries for conflicts. Pure and browser-safe: the Scheduler runs it
 * client-side after every drag-and-drop so highlights update instantly.
 */
export function detectConflicts(entries: SchedEntry[], ctx: ConflictContext): DetectedConflict[] {
  const out: DetectedConflict[] = [];

  for (let i = 0; i < entries.length; i++) {
    const a = entries[i];
    const room = ctx.roomById.get(a.roomId);
    const subject = ctx.subjectById.get(a.subjectId);
    const faculty = ctx.facultyById.get(a.facultyId);
    const sectionCount = ctx.sectionStudentCountById.get(a.sectionId) ?? 0;

    if (room && sectionCount > room.capacity) {
      push(
        out,
        "CAPACITY_CONFLICT",
        "HIGH",
        `Room capacity (${room.capacity}) is less than section enrollment (${sectionCount}).`,
        a
      );
    }

    if (subject && room) {
      const requiresLab = a.component === "LABORATORY";
      const roomIsLab = room.roomType === "COMPUTER_LABORATORY" || room.roomType === "SCIENCE_LABORATORY";
      if (requiresLab && !roomIsLab) {
        push(
          out,
          "SUBJECT_REQUIREMENT_CONFLICT",
          "MEDIUM",
          `Laboratory component of "${subject.name}" is booked in a non-laboratory room "${room.roomName}".`,
          a
        );
      }
    }

    if (faculty && faculty.availability.length > 0) {
      const available = faculty.availability.some(
        (w) => w.dayOfWeek === a.dayOfWeek && a.startMin >= w.startMin && a.endMin <= w.endMin
      );
      if (!available) {
        push(
          out,
          "AVAILABILITY_CONFLICT",
          "MEDIUM",
          `${faculty.fullName} is not marked available on ${a.dayOfWeek} at this time.`,
          a
        );
      }
    }

    for (let j = i + 1; j < entries.length; j++) {
      const b = entries[j];
      if (a.dayOfWeek !== b.dayOfWeek) continue;
      if (!rangesOverlap(a, b)) continue;
      if (!termsConcurrent(a, b, ctx.termRanges)) continue;

      if (a.facultyId === b.facultyId) {
        push(out, "FACULTY_CONFLICT", "CRITICAL", "Faculty is double-booked at this time.", a, b);
      }
      if (a.roomId === b.roomId) {
        push(out, "ROOM_CONFLICT", "CRITICAL", "Room is double-booked at this time.", a, b);
      }
      if (a.sectionId === b.sectionId) {
        push(out, "SECTION_CONFLICT", "CRITICAL", "Section has two classes scheduled at this time.", a, b);
      }
    }
  }

  return out;
}
