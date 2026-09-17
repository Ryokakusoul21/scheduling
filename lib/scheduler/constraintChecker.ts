import {
  SchedEntry,
  SchedFaculty,
  SchedRoom,
  SchedSubject,
  rangesOverlap,
} from "./types";

export interface HardConstraintViolation {
  rule: string;
  message: string;
}

/**
 * Checks all HARD constraints for a candidate entry against a set of already-placed
 * entries (existing schedule). Returns an empty array if the entry may be placed.
 * This is the single source of truth for "is this placement legal" - both the
 * generator and manual schedule edits must call this before committing a change.
 */
export function checkHardConstraints(
  candidate: SchedEntry,
  existing: SchedEntry[],
  ctx: {
    faculty: SchedFaculty;
    room: SchedRoom;
    subject: SchedSubject;
    sectionStudentCount: number;
  }
): HardConstraintViolation[] {
  const violations: HardConstraintViolation[] = [];
  const candRange = { startMin: candidate.startMin, endMin: candidate.endMin };

  for (const other of existing) {
    if (other.id && candidate.id && other.id === candidate.id) continue;
    if (other.dayOfWeek !== candidate.dayOfWeek) continue;
    const otherRange = { startMin: other.startMin, endMin: other.endMin };
    if (!rangesOverlap(candRange, otherRange)) continue;

    if (other.facultyId === candidate.facultyId) {
      violations.push({
        rule: "FACULTY_DOUBLE_BOOK",
        message: `Faculty is already teaching another class at this time.`,
      });
    }
    if (other.roomId === candidate.roomId) {
      violations.push({
        rule: "ROOM_DOUBLE_BOOK",
        message: `Room is already occupied at this time.`,
      });
    }
    if (other.sectionId === candidate.sectionId) {
      violations.push({
        rule: "SECTION_DOUBLE_BOOK",
        message: `Section already has a class scheduled at this time.`,
      });
    }
  }

  // Room capacity
  if (ctx.room.capacity < ctx.sectionStudentCount) {
    violations.push({
      rule: "ROOM_CAPACITY",
      message: `Room capacity (${ctx.room.capacity}) is less than section enrollment (${ctx.sectionStudentCount}).`,
    });
  }

  // Room status
  if (ctx.room.status !== "AVAILABLE") {
    violations.push({
      rule: "ROOM_UNAVAILABLE",
      message: `Room is currently ${ctx.room.status.toLowerCase().replace("_", " ")}.`,
    });
  }

  // Room type requirement
  const requiresLab = candidate.component === "LABORATORY";
  const roomIsLab =
    ctx.room.roomType === "COMPUTER_LABORATORY" || ctx.room.roomType === "SCIENCE_LABORATORY";
  if (requiresLab && !roomIsLab) {
    violations.push({
      rule: "ROOM_TYPE_MISMATCH",
      message: `Laboratory component requires a laboratory room, but "${ctx.room.roomName}" is not one.`,
    });
  }
  if (!requiresLab && ctx.subject.requiredRoomType !== ctx.room.roomType && !requiresLab) {
    // Lecture component should use the subject's declared lecture room type when specified.
    if (ctx.subject.requiredRoomType !== "OTHER" && ctx.room.roomType !== ctx.subject.requiredRoomType) {
      violations.push({
        rule: "SUBJECT_ROOM_TYPE",
        message: `Subject "${ctx.subject.name}" requires room type ${ctx.subject.requiredRoomType}, but "${ctx.room.roomName}" is ${ctx.room.roomType}.`,
      });
    }
  }

  // Faculty availability
  const facultyAvailable = ctx.faculty.availability.some(
    (a) =>
      a.dayOfWeek === candidate.dayOfWeek &&
      candidate.startMin >= a.startMin &&
      candidate.endMin <= a.endMin
  );
  if (ctx.faculty.availability.length > 0 && !facultyAvailable) {
    violations.push({
      rule: "FACULTY_AVAILABILITY",
      message: `Faculty is not available on ${candidate.dayOfWeek} at this time.`,
    });
  }

  // Room availability (if explicit availability windows are defined)
  const roomAvailable = ctx.room.availability.length === 0
    ? true
    : ctx.room.availability.some(
        (a) =>
          a.dayOfWeek === candidate.dayOfWeek &&
          candidate.startMin >= a.startMin &&
          candidate.endMin <= a.endMin
      );
  if (!roomAvailable) {
    violations.push({
      rule: "ROOM_AVAILABILITY",
      message: `Room is not available on ${candidate.dayOfWeek} at this time.`,
    });
  }

  return violations;
}

/** Faculty max-hours-per-week hard cap (treated as hard: never overload past max). */
export function checkFacultyWorkloadCap(
  faculty: SchedFaculty,
  additionalHours: number
): HardConstraintViolation[] {
  if (faculty.assignedHours + additionalHours > faculty.maxHours) {
    return [
      {
        rule: "FACULTY_MAX_HOURS",
        message: `Assigning this class would exceed ${faculty.fullName}'s maximum load of ${faculty.maxHours} hours/week.`,
      },
    ];
  }
  return [];
}
