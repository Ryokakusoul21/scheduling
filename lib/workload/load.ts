import "server-only";
import { prisma } from "@/lib/db/prisma";
import { getWorkloadSettings } from "@/lib/settings";
import { concurrentTermIds } from "@/lib/scheduler/term-conflicts";
import type { Assignment, WFaculty, WMeeting } from "./optimizer";

/**
 * Builds the optimizer input for the given terms, always from the live records so loads never drift: active
 * faculty (optionally one department), their scheduled classes plus assigned subjects not scheduled yet,
 * every meeting each faculty member teaches in concurrent terms (for clash checks), classes still with
 * inactive faculty, and the moves people undid or rejected.
 */
export async function loadWorkload(termIds: string[], departmentId: string | null) {
  const concurrent = [...new Set((await Promise.all(termIds.map(concurrentTermIds))).flat())];
  const [limits, facultyRows, schedules, planned, undone, rejected] = await Promise.all([
    getWorkloadSettings(),
    prisma.faculty.findMany({
      include: { availability: true, department: { select: { name: true } } },
      orderBy: { fullName: "asc" },
    }),
    prisma.schedule.findMany({
      where: { semesterId: { in: concurrent }, status: { not: "ARCHIVED" } },
      include: {
        subject: { select: { code: true, name: true, units: true } },
        section: { select: { name: true, level: true, departmentId: true } },
      },
    }),
    prisma.subjectAssignment.findMany({
      where: { semesterId: { in: termIds }, status: "ACTIVE" },
      select: {
        id: true, facultyId: true, sectionId: true, subjectId: true, semesterId: true,
        subject: { select: { code: true, name: true, units: true, lectureHours: true, labHours: true, level: true, departmentId: true } },
        section: { select: { name: true, level: true, departmentId: true } },
      },
    }),
    prisma.workloadFix.findMany({ where: { undoneAt: { not: null } }, select: { assignmentKey: true } }),
    prisma.workloadProposalItem.findMany({ where: { status: "REJECTED" }, select: { key: true, toFacultyId: true } }),
  ]);
  // Undone fixes keep the class where a person left it; rejected rows only rule out that receiver.
  const declined = [...undone.map((u) => u.assignmentKey), ...rejected.map((r) => `${r.key}>${r.toFacultyId}`)];

  // Archived faculty count as inactive, so their remaining classes are proposed for reassignment.
  const teaching = (f: (typeof facultyRows)[number]) => f.status === "ACTIVE" && !f.archivedAt;
  const active = facultyRows.filter((f) => teaching(f) && (!departmentId || f.departmentId === departmentId));
  const faculty: (WFaculty & { departmentName: string })[] = active.map((f) => ({
    id: f.id,
    name: f.fullName,
    departmentId: f.departmentId,
    departmentName: f.department?.name ?? "No department",
    specialization: f.specialization,
    teachingLevels: f.teachingLevels,
    maxHours: f.maxHours,
    employmentType: f.employmentType,
    availability: f.availability.map((a) => ({ dayOfWeek: a.dayOfWeek, startMin: a.startMin, endMin: a.endMin })),
  }));
  const inactive = new Map(facultyRows.filter((f) => !teaching(f)).map((f) => [f.id, f.fullName]));

  const busy = new Map<string, WMeeting[]>();
  for (const s of schedules) busy.set(s.facultyId, [...(busy.get(s.facultyId) ?? []), { scheduleId: s.id, dayOfWeek: s.dayOfWeek, startMin: s.startMin, endMin: s.endMin }]);

  const inScope = new Set(faculty.map((f) => f.id));
  const inTerms = schedules.filter((s) => termIds.includes(s.semesterId));
  const groups = new Map<string, Assignment>();
  for (const s of inTerms) {
    const sectionDepartment = s.section.departmentId ?? null;
    const orphan = inactive.has(s.facultyId) && (!departmentId || sectionDepartment === departmentId);
    if (!inScope.has(s.facultyId) && !orphan) continue;
    const key = `${s.sectionId}|${s.subjectId}|${s.facultyId}`;
    const g = groups.get(key) ?? {
      key,
      facultyId: s.facultyId,
      subjectName: `${s.subject.code} ${s.subject.name}`,
      subjectUnits: s.subject.units,
      sectionName: s.section.name,
      sectionLevel: s.section.level,
      departmentId: sectionDepartment,
      meetings: [],
    };
    g.meetings.push({ scheduleId: s.id, dayOfWeek: s.dayOfWeek, startMin: s.startMin, endMin: s.endMin });
    groups.set(key, g);
  }
  // Assigned subjects with no scheduled class yet count at their curriculum hours.
  for (const p of planned) {
    if (!inScope.has(p.facultyId) && !inactive.has(p.facultyId)) continue;
    const scheduled = inTerms.some((s) => s.semesterId === p.semesterId && s.facultyId === p.facultyId && s.subjectId === p.subjectId && (!p.sectionId || s.sectionId === p.sectionId));
    if (scheduled) continue;
    groups.set(`plan|${p.id}`, {
      key: `plan|${p.id}`,
      assignmentId: p.id,
      facultyId: p.facultyId,
      subjectName: `${p.subject.code} ${p.subject.name}`,
      subjectUnits: p.subject.units,
      sectionName: p.section?.name ?? "All sections",
      sectionLevel: p.section?.level ?? p.subject.level,
      departmentId: p.section?.departmentId ?? p.subject.departmentId,
      meetings: [],
      plannedHours: p.subject.lectureHours + p.subject.labHours,
    });
  }
  const all = [...groups.values()];

  return {
    limits,
    faculty,
    assignments: all.filter((a) => inScope.has(a.facultyId)),
    unassigned: all.filter((a) => inactive.has(a.facultyId)),
    inactiveNames: inactive,
    blocked: new Set(declined),
    busy,
  };
}
