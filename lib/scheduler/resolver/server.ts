import { roomLabel } from "@/lib/rooms/label";
import { effectiveTimetable } from "@/lib/timetable/config";
import { readTimetableBundle } from "@/lib/timetable/service";
import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";
import { can } from "@/lib/permissions/policy";
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
export async function serverInput(scope: Scope, termIds: string[], db: Prisma.TransactionClient = prisma): Promise<ResolverInput> {
  const terms = [...new Set((await Promise.all(termIds.map((id) => concurrentTermIds(id, db)))).flat())];
  const [schedules, sections, subjects, faculty, rooms, semesters, rules, ruleCtx, assignments, submissions] = await Promise.all([
    db.schedule.findMany({ where: { semesterId: { in: terms }, status: { not: "ARCHIVED" } } }),
    db.section.findMany({ where: { semesterId: { in: terms } }, include: { classPlaceholders: { select: { subjectId: true, component: true } } } }),
    db.subject.findMany({ select: { id: true, code: true, name: true, lectureHours: true, labHours: true, requiredRoomType: true, archivedAt: true } }),
    db.faculty.findMany({ include: { availability: true, roomPreferences: { orderBy: { rank: "asc" }, select: { roomId: true } } } }),
    db.room.findMany({ include: { availability: true, department: { select: { code: true } }, programs: { select: { id: true } } } }),
    db.semester.findMany({ where: { id: { in: terms } }, select: { id: true, startDate: true, endDate: true } }),
    activeRules(db),
    loadContext(db),
    db.subjectAssignment.findMany({ where: { status: "ACTIVE", semesterId: { in: terms }, sectionId: { not: null } }, select: { sectionId: true, subjectId: true, facultyId: true, semesterId: true } }),
    db.timetableSubmission.findMany({ where: { semesterId: { in: terms }, kind: "CLASS", status: { in: ["SUBMITTED", "APPROVED"] } }, select: { departmentId: true, semesterId: true } }),
  ]);
  const timetables = await readTimetableBundle(db);
  const approvedFacultyIds = new Set(assignments.filter((a) => sections.some((s) => s.id === a.sectionId && s.semesterId === a.semesterId && !s.archivedAt && can({ ...scope, id: scope.userId }, "edit", { type: "section", ...s }))).map((a) => a.facultyId));
  const window = (a: { dayOfWeek: ResolverEntry["dayOfWeek"]; startMin: number; endMin: number }) => ({ dayOfWeek: a.dayOfWeek, startMin: a.startMin, endMin: a.endMin });
  return {
    assignments: assignments.flatMap((a) => a.sectionId ? [{ ...a, sectionId: a.sectionId }] : []),
    entries: schedules.map((s) => ({
      id: s.id, semesterId: s.semesterId, sectionId: s.sectionId, subjectId: s.subjectId, facultyId: s.facultyId, roomId: s.roomId,
      component: s.component, dayOfWeek: s.dayOfWeek, startMin: s.startMin, endMin: s.endMin, status: s.status,
    })),
    sections: sections.map((s) => ({
      id: s.id, name: s.name, level: s.level, programId: s.programId, departmentId: s.departmentId, termId: s.semesterId ?? "", studentCount: s.studentCount,
      curriculum: s.classPlaceholders.flatMap((c) => {
        const subject = subjects.find((sub) => sub.id === c.subjectId && !sub.archivedAt);
        const hours = (c.component === "LECTURE" ? subject?.lectureHours : subject?.labHours) ?? 0;
        return hours > 0 ? [{ ...c, requiredMin: Math.round(hours * 60) }] : [];
      }),
      editable: !s.archivedAt && can({ ...scope, id: scope.userId }, "edit", { type: "section", ...s }) && !submissions.some((sub) => sub.departmentId === s.departmentId && sub.semesterId === s.semesterId),
    })),
    subjects,
    faculty: faculty.map((f) => ({
      id: f.id, fullName: f.fullName, maxHours: f.maxHours, assignedHours: 0, teachingLevels: f.teachingLevels,
      dayOff: f.employmentType === "PART_TIME" ? f.dayOff : null,
      availability: f.availability.map(window),
      assignable: f.status === "ACTIVE" && !f.archivedAt && (!isForeign(scope, f.departmentId) || approvedFacultyIds.has(f.id)),
      unavailableReason: f.status !== "ACTIVE" || f.archivedAt ? "The assigned teacher is inactive or archived. Choose an active teacher in Subjects." : isForeign(scope, f.departmentId) && !approvedFacultyIds.has(f.id) ? "The assigned teacher belongs to another department. Department approval is required before automatic placement." : undefined,
      preferredRoomIds: f.roomPreferences.map((p) => p.roomId),
    })),
    rooms: rooms.map((r) => ({
      id: r.id, roomNumber: r.roomNumber, roomName: roomLabel(r), capacity: r.capacity, roomType: r.roomType, status: r.status,
      availability: r.availability.map(window),
      departmentId: r.departmentId, departmentCode: r.department?.code,
      programIds: r.isGeneralShared ? null : r.programs.map((p) => p.id),
      assignable: r.status === "AVAILABLE" && !r.archivedAt && !isForeign(scope, r.departmentId),
    })),
    rules,
    ruleCtx,
    termRanges: new Map(semesters.map((t) => [t.id, { start: t.startDate.getTime(), end: t.endDate.getTime() }])),
    timetables: Object.fromEntries(sections.map((s) => [s.id, effectiveTimetable(timetables, s.departmentId, s.semesterId)])),
    bounds: { startMin: 0, endMin: 1440 },
    step: DEFAULT_GRID.slot,
  };
}
