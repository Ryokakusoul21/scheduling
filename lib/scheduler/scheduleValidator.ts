import { SchedEntry, SchedFaculty, SchedRoom, SchedSubject } from "./types";
import { checkHardConstraints, checkFacultyWorkloadCap, HardConstraintViolation } from "./constraintChecker";

export interface ValidationContext {
  facultyById: Map<string, SchedFaculty>;
  roomById: Map<string, SchedRoom>;
  subjectById: Map<string, SchedSubject>;
  sectionStudentCountById: Map<string, number>;
}

export interface ScheduleViolation extends HardConstraintViolation {
  entry: SchedEntry;
}

/**
 * Final safety net before persisting or publishing a schedule: replays every entry against
 * every other placed-so-far entry and re-checks all hard constraints. A generated or manually
 * edited schedule must return an empty array here before it is allowed to be saved/published.
 */
export function validateSchedule(entries: SchedEntry[], ctx: ValidationContext): ScheduleViolation[] {
  const violations: ScheduleViolation[] = [];
  const placed: SchedEntry[] = [];

  for (const entry of entries) {
    const faculty = ctx.facultyById.get(entry.facultyId);
    const room = ctx.roomById.get(entry.roomId);
    const subject = ctx.subjectById.get(entry.subjectId);
    const sectionStudentCount = ctx.sectionStudentCountById.get(entry.sectionId) ?? 0;

    if (!faculty || !room || !subject) {
      violations.push({
        rule: "MISSING_REFERENCE",
        message: "Entry references a faculty, room, or subject that no longer exists.",
        entry,
      });
      placed.push(entry);
      continue;
    }

    const hard = checkHardConstraints(entry, placed, { faculty, room, subject, sectionStudentCount });
    const workload = checkFacultyWorkloadCap(faculty, (entry.endMin - entry.startMin) / 60);

    for (const v of [...hard, ...workload]) violations.push({ ...v, entry });
    placed.push(entry);
  }

  return violations;
}

export function isScheduleValid(entries: SchedEntry[], ctx: ValidationContext): boolean {
  return validateSchedule(entries, ctx).length === 0;
}
