import { SchedEntry, SchedFaculty, SchedRoom, SchedSubject, SchedulingConstraints, DEFAULT_CONSTRAINTS } from "./types";
import { checkHardConstraints, checkFacultyWorkloadCap } from "./constraintChecker";
import { buildCandidateSlots } from "./scheduleGenerator";
import { scoreSchedule } from "./scheduleScorer";

export interface OptimizationContext {
  facultyById: Map<string, SchedFaculty>;
  roomById: Map<string, SchedRoom>;
  subjectById: Map<string, SchedSubject>;
  sectionStudentCountById: Map<string, number>;
  facultyPool: SchedFaculty[];
  roomPool: SchedRoom[];
  constraints?: SchedulingConstraints;
}

export interface OptimizationResult {
  entries: SchedEntry[];
  movesApplied: number;
  scoreBefore: number;
  scoreAfter: number;
}

/**
 * Local-search (hill-climbing) pass: repeatedly tries relocating one entry at a time to a
 * different legal day/time/room. A relocation is only kept if it strictly improves the overall
 * score and introduces zero hard-constraint violations - so this can only ever improve (or leave
 * unchanged) a schedule that was already hard-constraint-clean.
 */
export function optimizeSchedule(
  initialEntries: SchedEntry[],
  ctx: OptimizationContext,
  maxIterations = 3
): OptimizationResult {
  const constraints = ctx.constraints ?? DEFAULT_CONSTRAINTS;
  let entries = [...initialEntries];
  const scoreBefore = scoreSchedule(entries, { faculty: ctx.facultyPool, rooms: ctx.roomPool, constraints }).overallScore;
  let movesApplied = 0;

  for (let iter = 0; iter < maxIterations; iter++) {
    let improvedThisPass = false;

    for (let idx = 0; idx < entries.length; idx++) {
      const entry = entries[idx];
      const subject = ctx.subjectById.get(entry.subjectId);
      const faculty = ctx.facultyById.get(entry.facultyId);
      if (!subject || !faculty) continue;

      const durationMin = entry.endMin - entry.startMin;
      const others = entries.filter((_, i) => i !== idx);
      const currentScore = scoreSchedule(entries, { faculty: ctx.facultyPool, rooms: ctx.roomPool, constraints }).overallScore;

      const candidateSlots = buildCandidateSlots(durationMin, constraints).filter((s) => s.soft);

      let bestAlt: SchedEntry | null = null;
      let bestScore = currentScore;

      for (const slot of candidateSlots.slice(0, 20)) {
        for (const room of ctx.roomPool) {
          const alt: SchedEntry = { ...entry, dayOfWeek: slot.day, startMin: slot.startMin, endMin: slot.endMin, roomId: room.id };

          const sectionStudentCount = ctx.sectionStudentCountById.get(entry.sectionId) ?? 0;
          const hard = checkHardConstraints(alt, others, { faculty, room, subject, sectionStudentCount });
          const workload = checkFacultyWorkloadCap(faculty, durationMin / 60);
          if (hard.length > 0 || workload.length > 0) continue;

          const candidateEntries = [...others, alt];
          const candidateScore = scoreSchedule(candidateEntries, {
            faculty: ctx.facultyPool,
            rooms: ctx.roomPool,
            constraints,
          }).overallScore;

          if (candidateScore > bestScore) {
            bestScore = candidateScore;
            bestAlt = alt;
          }
        }
      }

      if (bestAlt) {
        entries = [...others, bestAlt];
        movesApplied++;
        improvedThisPass = true;
      }
    }

    if (!improvedThisPass) break;
  }

  const scoreAfter = scoreSchedule(entries, { faculty: ctx.facultyPool, rooms: ctx.roomPool, constraints }).overallScore;
  return { entries, movesApplied, scoreBefore, scoreAfter };
}
