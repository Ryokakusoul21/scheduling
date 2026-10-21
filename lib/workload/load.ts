import "server-only";
import { prisma } from "@/lib/db/prisma";
import { getWorkloadSettings } from "@/lib/settings";
import { concurrentTermIds } from "@/lib/scheduler/term-conflicts";
import type { Assignment, WFaculty, WMeeting } from "./optimizer";

/**
 * Builds the optimizer input for the given terms: active faculty (optionally one department), their
 * assignments, every meeting each faculty member teaches in concurrent terms (for clash checks),
 * classes still assigned to inactive faculty, and the moves people already undid.
 */
export async function loadWorkload(termIds: string[], departmentId: string | null) {
  const concurrent = [...new Set((await Promise.all(termIds.map(concurrentTermIds))).flat())];
  const [limits, facultyRows, schedules, undone, rejected] = await Promise.all([
    getWorkloadSettings(),
    prisma.faculty.findMany({
      include: { availability: true, department: { select: { name: true } } },
      orderBy: { fullName: "asc" },
    }),
    prisma.schedule.findMany({
      where: { semesterId: { in: concurrent }, status: { not: "ARCHIVED" } },
      include: {
        subject: { select: { code: true, name: true, units: true } },
        section: { select: { name: true, level: true, program: { select: { departmentId: true } } } },
      },
    }),
    prisma.workloadFix.findMany({ where: { undoneAt: { not: null } }, select: { assignmentKey: true } }),
    prisma.workloadProposal.findMany({ where: { automatic: true, status: "REJECTED" }, select: { items: true } }),
  ]);
  // Classes whose fix was undone, or whose automatic proposal was rejected, stay where a person left them.
  const declined = [...undone.map((u) => u.assignmentKey), ...rejected.flatMap((p) => (p.items as unknown as { key: string }[]).map((m) => m.key))];

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
    availability: f.availability.map((a) => ({ dayOfWeek: a.dayOfWeek, startMin: a.startMin, endMin: a.endMin })),
  }));
  const inactive = new Map(facultyRows.filter((f) => !teaching(f)).map((f) => [f.id, f.fullName]));

  const busy = new Map<string, WMeeting[]>();
  for (const s of schedules) busy.set(s.facultyId, [...(busy.get(s.facultyId) ?? []), { scheduleId: s.id, dayOfWeek: s.dayOfWeek, startMin: s.startMin, endMin: s.endMin }]);

  const inScope = new Set(faculty.map((f) => f.id));
  const groups = new Map<string, Assignment>();
  for (const s of schedules) {
    if (!termIds.includes(s.semesterId)) continue;
    const sectionDepartment = s.section.program?.departmentId ?? null;
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
