import type { AcademicLevel } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { departmentWhere, isForeign } from "@/lib/permissions/department";
import type { Scope } from "@/lib/permissions/scope";
import { levelLabel, termLabel } from "@/lib/academics/levels";
import { EXAM_PERIODS } from "@/lib/examinations/types";
import { loadExamContext } from "@/lib/examinations/context";
import { ExamWorkspace, type ExamData } from "@/components/scheduler/exam-workspace";

const day = (d: Date) => d.toISOString().slice(0, 10);

/** Loads the Examination Schedule mode of the Scheduler, scoped on the server to the person's department and programs. */
export async function ExamMode({ scope, academicYearId, academicYearControl, modes }: { scope: Scope; academicYearId: string; academicYearControl: React.ReactNode; modes?: React.ReactNode }) {
  const hod = scope.role === "HEAD_OF_DEPARTMENT";
  const termIds = (await prisma.semester.findMany({ where: { academicYearId }, select: { id: true } })).map((t) => t.id);
  const examScope = departmentWhere.examination(scope);

  const [programs, sections, faculty, rooms, exams, busyRows, classes] = await Promise.all([
    prisma.program.findMany({ where: departmentWhere.program(scope), orderBy: [{ level: "asc" }, { sortOrder: "asc" }] }),
    prisma.section.findMany({ where: { ...departmentWhere.section(scope), archivedAt: null, semesterId: { in: termIds } }, orderBy: [{ level: "asc" }, { sortOrder: "asc" }, { name: "asc" }] }),
    // The teacher of a class is its default proctor, even when the teacher belongs to another department (a shared General Education class).
    prisma.faculty.findMany({ where: { status: "ACTIVE", archivedAt: null, OR: [departmentWhere.faculty(scope), { schedules: { some: { semesterId: { in: termIds }, ...departmentWhere.schedule(scope) } } }] }, orderBy: { fullName: "asc" } }),
    // Rooms stay campus-wide for availability; another department's room can only be requested from the Registrar.
    prisma.room.findMany({ where: { archivedAt: null, status: "AVAILABLE" }, orderBy: [{ sortOrder: "asc" }, { roomName: "asc" }] }),
    prisma.examination.findMany({ where: { AND: [examScope, { semesterId: { in: termIds } }] }, orderBy: [{ date: "asc" }, { startMin: "asc" }] }),
    hod
      ? prisma.examination.findMany({ where: { semesterId: { in: termIds }, NOT: examScope }, select: { id: true, date: true, startMin: true, endMin: true, roomId: true, proctorId: true, sectionId: true } })
      : [],
    prisma.schedule.findMany({
      where: { AND: [departmentWhere.schedule(scope), { semesterId: { in: termIds }, status: { not: "ARCHIVED" } }] },
      select: { sectionId: true, subjectId: true, facultyId: true, roomId: true, semesterId: true, component: true, dayOfWeek: true, startMin: true, endMin: true },
    }),
  ]);
  const levels = [...new Set([...programs.map((p) => p.level), ...sections.map((s) => s.level)])];
  const [terms, subjects] = await Promise.all([
    prisma.semester.findMany({
      where: { academicYearId, ...(hod ? { level: { in: levels }, OR: [{ programId: null }, { programId: { in: programs.map((p) => p.id) } }] } : {}) },
      orderBy: [{ level: "asc" }, { startDate: "asc" }],
    }),
    prisma.subject.findMany({ where: { OR: [departmentWhere.subject(scope), { id: { in: classes.map((c) => c.subjectId) } }] }, select: { id: true, code: true, name: true }, orderBy: { code: "asc" } }),
  ]);

  // Official windows and blocked dates come only from the approved Calendar of Activities.
  const contexts = await Promise.all(EXAM_PERIODS.map(async (type) => ({ type, ...(await loadExamContext(type, null, scope.isAdmin ? null : scope.departmentIds)) })));
  const facultyIds = new Set(faculty.map((f) => f.id));

  const data: ExamData = {
    terms: terms.map((t) => ({ id: t.id, level: t.level as AcademicLevel, programId: t.programId, isActive: t.isActive, label: `${levelLabel(t.level)} · ${termLabel(t.type)}${t.isActive ? " (active)" : ""}` })),
    programs: programs.map((p) => ({ id: p.id, code: p.code, name: p.name, level: p.level })),
    sections: sections.map((s) => ({ id: s.id, name: s.name, level: s.level, programId: s.programId, semesterId: s.semesterId, studentCount: s.studentCount })),
    subjects,
    faculty: faculty.map((f) => ({ id: f.id, fullName: f.fullName })),
    rooms: rooms.map((r) => ({ id: r.id, roomName: r.roomName, capacity: r.capacity, foreign: isForeign(scope, r.departmentId) })),
    exams: exams.map((e) => ({
      id: e.id, semesterId: e.semesterId, sectionId: e.sectionId, subjectId: e.subjectId, roomId: e.roomId, proctorId: e.proctorId,
      type: e.type, date: day(e.date), startMin: e.startMin, endMin: e.endMin, status: e.status, notes: e.notes ?? "", reviewNote: e.reviewNote,
    })),
    // Other departments' examinations are known only as busy rooms and times, never as which examination they are.
    busy: busyRows.map((e) => ({ id: `busy-${e.id}`, date: day(e.date), startMin: e.startMin, endMin: e.endMin, sectionId: `busy-${e.id}`, roomId: e.roomId, proctorId: facultyIds.has(e.proctorId) ? e.proctorId : "" })),
    classes,
    windows: contexts.map((c) => ({ type: c.type, window: c.window })),
    blocked: [...(contexts[0]?.blockedDates ?? new Map<string, string>())],
    canEdit: true,
    canSubmit: hod,
    isAdmin: scope.isAdmin,
  };
  return <ExamWorkspace data={data} academicYearControl={academicYearControl} modes={modes} />;
}
