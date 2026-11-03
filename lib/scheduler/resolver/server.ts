import "server-only";
import { prisma } from "@/lib/db/prisma";
import { isForeign } from "@/lib/permissions/department";
import type { Scope } from "@/lib/permissions/scope";
import { activeRules, loadContext } from "../constraints-server";
import { concurrentTermIds } from "../term-conflicts";
import { DEFAULT_GRID } from "../timetable";
import type { ResolverEntry, ResolverInput } from "./types";

/**
 * The resolver's world rebuilt from the database for the given terms and every term running alongside them.
 * Unlike the browser copy nothing is anonymized: the server checks proposed changes against every class.
 */
export async function serverInput(scope: Scope, termIds: string[]): Promise<ResolverInput> {
  const terms = [...new Set((await Promise.all(termIds.map(concurrentTermIds))).flat())];
  const [schedules, sections, subjects, faculty, rooms, semesters, rules, ruleCtx] = await Promise.all([
    prisma.schedule.findMany({ where: { semesterId: { in: terms }, status: { not: "ARCHIVED" } } }),
    prisma.section.findMany({ where: { semesterId: { in: terms } }, select: { id: true, name: true, level: true, programId: true, departmentId: true, semesterId: true, studentCount: true } }),
    prisma.subject.findMany({ select: { id: true, code: true, name: true, lectureHours: true, labHours: true, requiredRoomType: true } }),
    prisma.faculty.findMany({ include: { availability: true } }),
    prisma.room.findMany({ include: { availability: true, programs: { select: { id: true } } } }),
    prisma.semester.findMany({ where: { id: { in: terms } }, select: { id: true, startDate: true, endDate: true } }),
    activeRules(),
    loadContext(),
  ]);
  const window = (a: { dayOfWeek: ResolverEntry["dayOfWeek"]; startMin: number; endMin: number }) => ({ dayOfWeek: a.dayOfWeek, startMin: a.startMin, endMin: a.endMin });
  return {
    entries: schedules.map((s) => ({
      id: s.id, semesterId: s.semesterId, sectionId: s.sectionId, subjectId: s.subjectId, facultyId: s.facultyId, roomId: s.roomId,
      component: s.component, dayOfWeek: s.dayOfWeek, startMin: s.startMin, endMin: s.endMin, status: s.status,
    })),
    sections: sections.map((s) => ({ id: s.id, name: s.name, level: s.level, programId: s.programId, departmentId: s.departmentId, termId: s.semesterId ?? "", studentCount: s.studentCount, curriculum: [], editable: true })),
    subjects,
    faculty: faculty.map((f) => ({
      id: f.id, fullName: f.fullName, maxHours: f.maxHours, assignedHours: 0, teachingLevels: f.teachingLevels,
      dayOff: f.employmentType === "PART_TIME" ? f.dayOff : null,
      availability: f.availability.map(window),
      assignable: f.status === "ACTIVE" && !f.archivedAt && !isForeign(scope, f.departmentId),
    })),
    rooms: rooms.map((r) => ({
      id: r.id, roomNumber: r.roomNumber, roomName: r.roomName, capacity: r.capacity, roomType: r.roomType, status: r.status,
      availability: r.availability.map(window),
      programIds: r.isGeneralShared ? null : r.programs.map((p) => p.id),
      assignable: r.status === "AVAILABLE" && !r.archivedAt && !isForeign(scope, r.departmentId),
    })),
    rules,
    ruleCtx,
    termRanges: new Map(semesters.map((t) => [t.id, { start: t.startDate.getTime(), end: t.endDate.getTime() }])),
    bounds: { startMin: DEFAULT_GRID.dayStart, endMin: DEFAULT_GRID.dayEnd },
    step: DEFAULT_GRID.slot,
  };
}
