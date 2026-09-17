import {
  SchedEntry,
  SchedFaculty,
  SchedRoom,
  SchedSection,
  SchedSubject,
  SchedulingConstraints,
  DEFAULT_CONSTRAINTS,
  SubjectComponent,
  DayOfWeek,
} from "./types";
import { checkHardConstraints, checkFacultyWorkloadCap } from "./constraintChecker";
import { findAvailableFaculty } from "./facultyAllocator";
import { findAvailableRooms } from "./roomAllocator";

export interface SubjectAssignment {
  section: SchedSection;
  subject: SchedSubject;
}

export interface UnplacedItem {
  sectionName: string;
  subjectCode: string;
  component: SubjectComponent;
  reason: string;
}

export interface GenerationResult {
  entries: SchedEntry[];
  unplaced: UnplacedItem[];
}

interface CandidateSlot {
  day: DayOfWeek;
  startMin: number;
  endMin: number;
  soft: boolean; // true if within preferred (non-avoid) window
}

export function buildCandidateSlots(
  durationMin: number,
  constraints: SchedulingConstraints
): CandidateSlot[] {
  const slots: CandidateSlot[] = [];
  for (const day of constraints.allowedDays) {
    for (
      let start = constraints.dayStartMin;
      start + durationMin <= constraints.dayEndMin;
      start += constraints.slotGranularityMin
    ) {
      const end = start + durationMin;
      const withinAvoidBefore = constraints.avoidBefore === undefined || start >= constraints.avoidBefore;
      const withinAvoidAfter = constraints.avoidAfter === undefined || end <= constraints.avoidAfter;
      slots.push({ day, startMin: start, endMin: end, soft: withinAvoidBefore && withinAvoidAfter });
    }
  }
  // Prefer soft (non-avoid) slots first, otherwise keep natural chronological order.
  return slots.sort((a, b) => Number(b.soft) - Number(a.soft));
}

function countClassesForSectionOnDay(entries: SchedEntry[], sectionId: string, day: DayOfWeek) {
  return entries.filter((e) => e.sectionId === sectionId && e.dayOfWeek === day).length;
}

/**
 * Deterministic constraint-based scheduler: for every section/subject/component it searches
 * candidate day+time slots and picks the highest-scoring legal (faculty, room) pairing.
 * Nothing is ever placed if it would violate a hard constraint - such items are reported
 * as `unplaced` instead, so the output schedule is guaranteed hard-constraint-clean.
 */
export function generateSchedule(
  assignments: SubjectAssignment[],
  facultyPool: SchedFaculty[],
  roomPool: SchedRoom[],
  existingEntries: SchedEntry[] = [],
  constraints: SchedulingConstraints = DEFAULT_CONSTRAINTS,
  facultyOverrides: Record<string, string> = {}
): GenerationResult {
  const entries: SchedEntry[] = [...existingEntries];
  const unplaced: UnplacedItem[] = [];

  // Track working faculty hour totals so workload caps are respected across this whole run.
  const workingFaculty = facultyPool.map((f) => ({ ...f }));

  const components: { component: SubjectComponent; hours: number }[] = [];

  for (const { section, subject } of assignments) {
    components.length = 0;
    if (subject.lectureHours > 0) components.push({ component: "LECTURE", hours: subject.lectureHours });
    if (subject.labHours > 0) components.push({ component: "LABORATORY", hours: subject.labHours });

    for (const { component, hours } of components) {
      const durationMin = Math.round(hours * 60);
      const candidateSlots = buildCandidateSlots(durationMin, constraints);

      let placed = false;
      for (const slot of candidateSlots) {
        if (
          constraints.maxClassesPerDayPerSection &&
          countClassesForSectionOnDay(entries, section.id, slot.day) >= constraints.maxClassesPerDayPerSection
        ) {
          continue;
        }

        const pinnedFacultyId = facultyOverrides[subject.id];
        const facultyCandidates = pinnedFacultyId
          ? workingFaculty.filter((f) => f.id === pinnedFacultyId)
          : workingFaculty;

        // Try every legal room for this slot, then rank faculty within it.
        let bestChoice: { faculty: SchedFaculty; room: SchedRoom; score: number } | null = null;

        for (const room of roomPool) {
          const facultyRanked = findAvailableFaculty(
            slot.day,
            slot.startMin,
            slot.endMin,
            hours,
            component,
            subject,
            room,
            section.studentCount,
            facultyCandidates,
            entries,
            section.id
          );
          if (facultyRanked.length === 0) continue;

          const roomsRanked = findAvailableRooms(
            slot.day,
            slot.startMin,
            slot.endMin,
            component,
            subject,
            section.studentCount,
            [room],
            entries,
            facultyRanked[0].faculty,
            section.id,
            facultyRanked[0].faculty.id
          );
          if (roomsRanked.length === 0) continue;

          const combinedScore = facultyRanked[0].score + roomsRanked[0].score;
          if (!bestChoice || combinedScore > bestChoice.score) {
            bestChoice = { faculty: facultyRanked[0].faculty, room, score: combinedScore };
          }
        }

        if (!bestChoice) continue;

        const candidate: SchedEntry = {
          id: `tmp-${section.id}-${subject.id}-${component}`,
          subjectId: subject.id,
          sectionId: section.id,
          facultyId: bestChoice.faculty.id,
          roomId: bestChoice.room.id,
          component,
          dayOfWeek: slot.day,
          startMin: slot.startMin,
          endMin: slot.endMin,
        };

        const hardViolations = checkHardConstraints(candidate, entries, {
          faculty: bestChoice.faculty,
          room: bestChoice.room,
          subject,
          sectionStudentCount: section.studentCount,
        });
        const workloadViolations = checkFacultyWorkloadCap(bestChoice.faculty, hours);
        if (hardViolations.length > 0 || workloadViolations.length > 0) continue;

        entries.push(candidate);
        const facultyIdx = workingFaculty.findIndex((f) => f.id === bestChoice!.faculty.id);
        if (facultyIdx >= 0) workingFaculty[facultyIdx].assignedHours += hours;
        placed = true;
        break;
      }

      if (!placed) {
        unplaced.push({
          sectionName: section.name,
          subjectCode: subject.code,
          component,
          reason:
            "No legal (faculty, room, time) combination was found within the allowed scheduling window.",
        });
      }
    }
  }

  return { entries: entries.slice(existingEntries.length), unplaced };
}
