import { SchedEntry, SchedRoom, SchedSubject, SubjectComponent, DayOfWeek } from "./types";
import { checkHardConstraints } from "./constraintChecker";
import { SchedFaculty } from "./types";

export interface RoomCandidate {
  room: SchedRoom;
  score: number;
  idleMinutesThatDay: number;
}

/**
 * Returns rooms that can legally host the given candidate slot, ranked best-first.
 * Ranking favors: closest-fit capacity (less wasted space), higher current utilization
 * (fills rooms instead of spreading classes thin), matching room type exactly.
 */
export function findAvailableRooms(
  day: DayOfWeek,
  startMin: number,
  endMin: number,
  component: SubjectComponent,
  subject: SchedSubject,
  sectionStudentCount: number,
  rooms: SchedRoom[],
  existingEntries: SchedEntry[],
  faculty: SchedFaculty,
  sectionId: string,
  facultyId: string
): RoomCandidate[] {
  const candidates: RoomCandidate[] = [];

  for (const room of rooms) {
    const candidate: SchedEntry = {
      subjectId: subject.id,
      sectionId,
      facultyId,
      roomId: room.id,
      component,
      dayOfWeek: day,
      startMin,
      endMin,
    };

    const violations = checkHardConstraints(candidate, existingEntries, {
      faculty,
      room,
      subject,
      sectionStudentCount,
    });

    if (violations.length > 0) continue;

    const wastedCapacity = room.capacity - sectionStudentCount;
    const sameDayBookings = existingEntries.filter(
      (e) => e.roomId === room.id && e.dayOfWeek === day
    );
    const bookedMinutes = sameDayBookings.reduce((sum, e) => sum + (e.endMin - e.startMin), 0);

    let score = 100;
    score -= wastedCapacity * 0.5; // prefer tighter capacity fit
    score += bookedMinutes * 0.05; // prefer filling already-used rooms
    if (room.roomType === subject.requiredRoomType) score += 10;

    candidates.push({ room, score, idleMinutesThatDay: 720 - bookedMinutes });
  }

  return candidates.sort((a, b) => b.score - a.score);
}
