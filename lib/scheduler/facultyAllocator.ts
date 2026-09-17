import { SchedEntry, SchedFaculty, SchedRoom, SchedSubject, SubjectComponent, DayOfWeek } from "./types";
import { checkHardConstraints, checkFacultyWorkloadCap } from "./constraintChecker";

export interface FacultyCandidate {
  faculty: SchedFaculty;
  score: number;
}

/**
 * Returns faculty who can legally teach the given candidate slot, ranked best-first.
 * Ranking favors: specialization match, lower current workload (balances load),
 * and honors any explicit override the caller has already pinned.
 */
export function findAvailableFaculty(
  day: DayOfWeek,
  startMin: number,
  endMin: number,
  durationHours: number,
  component: SubjectComponent,
  subject: SchedSubject,
  room: SchedRoom,
  sectionStudentCount: number,
  facultyPool: SchedFaculty[],
  existingEntries: SchedEntry[],
  sectionId: string
): FacultyCandidate[] {
  const candidates: FacultyCandidate[] = [];

  for (const faculty of facultyPool) {
    const candidate: SchedEntry = {
      subjectId: subject.id,
      sectionId,
      facultyId: faculty.id,
      roomId: room.id,
      component,
      dayOfWeek: day,
      startMin,
      endMin,
    };

    const hardViolations = checkHardConstraints(candidate, existingEntries, {
      faculty,
      room,
      subject,
      sectionStudentCount,
    });
    const workloadViolations = checkFacultyWorkloadCap(faculty, durationHours);

    if (hardViolations.length > 0 || workloadViolations.length > 0) continue;

    let score = 100;
    const utilization = faculty.assignedHours / Math.max(faculty.maxHours, 1);
    score -= utilization * 40; // prefer less-loaded faculty for balance

    if (
      faculty.specialization &&
      subject.name.toLowerCase().includes(faculty.specialization.toLowerCase())
    ) {
      score += 20;
    }

    candidates.push({ faculty, score });
  }

  return candidates.sort((a, b) => b.score - a.score);
}
