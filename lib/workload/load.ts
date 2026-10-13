import "server-only";
import { prisma } from "@/lib/db/prisma";
import { getWorkloadSettings } from "@/lib/settings";
import { concurrentTermIds } from "@/lib/scheduler/term-conflicts";
import type { Assignment, WFaculty, WMeeting } from "./optimizer";

/**
 * Builds the optimizer input for the given terms: faculty (optionally one department), their
 * assignments, and every meeting each faculty member teaches in concurrent terms (for clash checks).
 */
export async function loadWorkload(termIds: string[], departmentId: string | null) {
  const concurrent = [...new Set((await Promise.all(termIds.map(concurrentTermIds))).flat())];
  const [limits, facultyRows, schedules] = await Promise.all([
    getWorkloadSettings(),
    prisma.faculty.findMany({
      where: { status: "ACTIVE", ...(departmentId ? { departmentId } : {}) },
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
  ]);

  const faculty: (WFaculty & { departmentName: string })[] = facultyRows.map((f) => ({
    id: f.id,
    name: f.fullName,
    departmentId: f.departmentId,
    departmentName: f.department?.name ?? "No department",
    specialization: f.specialization,
    teachingLevels: f.teachingLevels,
    maxHours: f.maxHours,
    availability: f.availability.map((a) => ({ dayOfWeek: a.dayOfWeek, startMin: a.startMin, endMin: a.endMin })),
  }));

  const busy = new Map<string, WMeeting[]>();
  for (const s of schedules) busy.set(s.facultyId, [...(busy.get(s.facultyId) ?? []), { scheduleId: s.id, dayOfWeek: s.dayOfWeek, startMin: s.startMin, endMin: s.endMin }]);

  const inScope = new Set(faculty.map((f) => f.id));
  const groups = new Map<string, Assignment>();
  for (const s of schedules) {
    if (!termIds.includes(s.semesterId) || !inScope.has(s.facultyId)) continue;
    const key = `${s.sectionId}|${s.subjectId}|${s.facultyId}`;
    const g = groups.get(key) ?? {
      key,
      facultyId: s.facultyId,
      subjectName: `${s.subject.code} ${s.subject.name}`,
      subjectUnits: s.subject.units,
      sectionName: s.section.name,
      sectionLevel: s.section.level,
      departmentId: s.section.program?.departmentId ?? null,
      meetings: [],
    };
    g.meetings.push({ scheduleId: s.id, dayOfWeek: s.dayOfWeek, startMin: s.startMin, endMin: s.endMin });
    groups.set(key, g);
  }

  return { limits, faculty, assignments: [...groups.values()], busy };
}
