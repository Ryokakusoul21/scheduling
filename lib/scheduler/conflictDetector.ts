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
 * Scans a full set of already-persisted entries for conflicts. Used by the Conflict Resolution
 * page and by anything that can move an entry into an illegal slot (drag-and-drop, manual edit).
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
