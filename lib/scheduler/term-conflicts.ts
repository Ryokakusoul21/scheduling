import "server-only";
import { prisma } from "@/lib/db/prisma";
import { detectConflicts, isOverlapConflict } from "./conflictDetector";
import { toSchedEntry, toSchedFaculty, toSchedRoom, toSchedSubject } from "./mappers";

/** Terms whose date range overlaps the given term (including itself). */
export async function concurrentTermIds(termId: string) {
  const term = await prisma.semester.findUnique({ where: { id: termId } });
  if (!term) return [];
  const rows = await prisma.semester.findMany({
    where: { startDate: { lte: term.endDate }, endDate: { gte: term.startDate } },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

/** Runs conflict detection over every non-archived class in the given terms. */
export async function detectConflictsForTerms(termIds: string[]) {
  if (termIds.length === 0) return [];
  const [schedules, terms] = await Promise.all([
    prisma.schedule.findMany({ where: { semesterId: { in: termIds }, status: { not: "ARCHIVED" } } }),
    prisma.semester.findMany({ where: { id: { in: termIds } }, select: { id: true, startDate: true, endDate: true } }),
  ]);
  if (schedules.length === 0) return [];

  const ids = <K extends "facultyId" | "roomId" | "subjectId" | "sectionId">(k: K) => [...new Set(schedules.map((s) => s[k]))];
  const [faculty, rooms, subjects, sections] = await Promise.all([
    prisma.faculty.findMany({ where: { id: { in: ids("facultyId") } }, include: { availability: true } }),
    prisma.room.findMany({ where: { id: { in: ids("roomId") } }, include: { availability: true } }),
    prisma.subject.findMany({ where: { id: { in: ids("subjectId") } } }),
    prisma.section.findMany({ where: { id: { in: ids("sectionId") } }, select: { id: true, studentCount: true } }),
  ]);

  return detectConflicts(schedules.map(toSchedEntry), {
    facultyById: new Map(faculty.map((f) => [f.id, toSchedFaculty(f)])),
    roomById: new Map(rooms.map((r) => [r.id, toSchedRoom(r)])),
    subjectById: new Map(subjects.map((s) => [s.id, toSchedSubject(s)])),
    sectionStudentCountById: new Map(sections.map((s) => [s.id, s.studentCount])),
    termRanges: new Map(terms.map((t) => [t.id, { start: t.startDate.getTime(), end: t.endDate.getTime() }])),
  });
}

/** Double-booking conflicts across all currently active terms (dashboard / assistant summaries). */
export async function activeOverlapConflicts() {
  const active = await prisma.semester.findMany({ where: { isActive: true }, select: { id: true } });
  const conflicts = await detectConflictsForTerms(active.map((t) => t.id));
  return conflicts.filter(isOverlapConflict);
}

const DAY_NAMES: Record<string, string> = {
  MONDAY: "Monday", TUESDAY: "Tuesday", WEDNESDAY: "Wednesday", THURSDAY: "Thursday", FRIDAY: "Friday", SATURDAY: "Saturday", SUNDAY: "Sunday",
};

/**
 * Double-booking guard for one weekly class: other classes in concurrent terms that share its
 * faculty member, room, or section at an overlapping time. Returns a readable reason or null.
 */
export async function weeklyDoubleBooking(entry: {
  semesterId: string;
  sectionId: string;
  facultyId: string;
  roomId: string;
  dayOfWeek: string;
  startMin: number;
  endMin: number;
}, excludeId?: string) {
  const termIds = await concurrentTermIds(entry.semesterId);
  const clash = await prisma.schedule.findFirst({
    where: {
      id: excludeId ? { not: excludeId } : undefined,
      semesterId: { in: termIds },
      status: { not: "ARCHIVED" },
      dayOfWeek: entry.dayOfWeek as never,
      startMin: { lt: entry.endMin },
      endMin: { gt: entry.startMin },
      OR: [{ facultyId: entry.facultyId }, { roomId: entry.roomId }, { sectionId: entry.sectionId }],
    },
    include: { subject: { select: { code: true } }, section: { select: { name: true } } },
  });
  if (!clash) return null;
  const what = [
    clash.facultyId === entry.facultyId && "faculty member",
    clash.roomId === entry.roomId && "room",
    clash.sectionId === entry.sectionId && "section",
  ].filter(Boolean).join(", ");
  return `Double booking: ${clash.subject.code} ${clash.section.name} already uses the ${what} on ${DAY_NAMES[clash.dayOfWeek]} at an overlapping time.`;
}
