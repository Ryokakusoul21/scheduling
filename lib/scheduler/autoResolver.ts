import { SchedEntry, SchedFaculty, SchedRoom, SchedSubject, SchedulingConstraints, DEFAULT_CONSTRAINTS, toHHMM } from "./types";
import { checkHardConstraints } from "./constraintChecker";
import { buildCandidateSlots } from "./scheduleGenerator";

export interface ResolutionOption {
  room: SchedRoom;
  dayOfWeek: SchedEntry["dayOfWeek"];
  startMin: number;
  endMin: number;
  label: string;
  score: number;
}

export interface ResolveContext {
  faculty: SchedFaculty;
  subject: SchedSubject;
  sectionStudentCount: number;
  roomPool: SchedRoom[];
  otherEntries: SchedEntry[]; // every other placed entry EXCLUDING the one being fixed
  constraints?: SchedulingConstraints;
}

/**
 * "Fix Automatically" - for one conflicting entry, searches every room and every candidate time
 * slot for a legal placement, ranks the results, and returns the top options so an admin can
 * pick one (or the caller can auto-apply the best).
 */
export function findResolutionOptions(entry: SchedEntry, ctx: ResolveContext, limit = 3): ResolutionOption[] {
  const constraints = ctx.constraints ?? DEFAULT_CONSTRAINTS;
  const durationMin = entry.endMin - entry.startMin;
  const slots = buildCandidateSlots(durationMin, constraints);
  const options: ResolutionOption[] = [];

  for (const slot of slots) {
    for (const room of ctx.roomPool) {
      const candidate: SchedEntry = { ...entry, dayOfWeek: slot.day, startMin: slot.startMin, endMin: slot.endMin, roomId: room.id };
      const violations = checkHardConstraints(candidate, ctx.otherEntries, {
        faculty: ctx.faculty,
        room,
        subject: ctx.subject,
        sectionStudentCount: ctx.sectionStudentCount,
      });
      if (violations.length > 0) continue;

      const wastedCapacity = room.capacity - ctx.sectionStudentCount;
      const sameSlot = candidate.dayOfWeek === entry.dayOfWeek && candidate.startMin === entry.startMin;
      let score = 100 - wastedCapacity * 0.5;
      if (sameSlot) score += 15; // prefer keeping the original time if only the room needs to change
      if (slot.soft) score += 10;

      options.push({
        room,
        dayOfWeek: candidate.dayOfWeek,
        startMin: candidate.startMin,
        endMin: candidate.endMin,
        score,
        label: `${room.roomName} · ${candidate.dayOfWeek} ${toHHMM(candidate.startMin)}-${toHHMM(candidate.endMin)}`,
      });
    }
  }

  return options.sort((a, b) => b.score - a.score).slice(0, limit);
}
