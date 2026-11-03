import "server-only";
import { prisma } from "@/lib/db/prisma";
import { loadWorkload } from "@/lib/workload/load";
import { loadReport } from "@/lib/workload/optimizer";
import type { AssignableFaculty } from "./assignment-rules";

const day = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** Active faculty with their load (from the workload engine) and any reported unavailability overlapping the term. */
export async function assignableFaculty(semesterId: string): Promise<{ measure: "HOURS" | "UNITS"; faculty: AssignableFaculty[] }> {
  const term = await prisma.semester.findUnique({ where: { id: semesterId }, select: { startDate: true, endDate: true } });
  const [rows, data, away] = await Promise.all([
    prisma.faculty.findMany({
      where: { status: "ACTIVE", archivedAt: null },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true, email: true, employeeId: true, departmentId: true, specialization: true, employmentType: true, department: { select: { name: true } } },
    }),
    loadWorkload([semesterId], null),
    term ? prisma.unavailability.findMany({
      where: { kind: "FACULTY", status: { not: "DISMISSED" }, startDate: { lte: term.endDate }, endDate: { gte: term.startDate } },
      select: { facultyId: true, startDate: true, endDate: true, reason: true },
    }) : [],
  ]);
  const loads = new Map(loadReport(data.faculty, data.assignments, data.limits).map((r) => [r.facultyId, r]));
  return {
    measure: data.limits.measure,
    faculty: rows.flatMap((f) => {
      const load = loads.get(f.id);
      return load ? [{
        id: f.id, name: f.fullName, email: f.email, employeeId: f.employeeId, departmentId: f.departmentId,
        departmentName: f.department?.name ?? "No department", specialization: f.specialization, employmentType: f.employmentType,
        load: load.load, minimum: load.minimum, limit: load.maximum,
        unavailability: away.filter((u) => u.facultyId === f.id).map((u) => `${day(u.startDate) === day(u.endDate) ? day(u.startDate) : `${day(u.startDate)} to ${day(u.endDate)}`} (${u.reason})`),
      }] : [];
    }),
  };
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * Keeps assignments in step when an approved workload move hands classes to another faculty member:
 * a section-specific assignment changes hands, and an all-sections one gains a section override.
 */
export async function syncAssignmentsForMove(tx: Tx, classes: { semesterId: string; sectionId: string; subjectId: string }[], fromFacultyId: string, toFacultyId: string) {
  const pairs = [...new Map(classes.map((c) => [`${c.semesterId}|${c.sectionId}|${c.subjectId}`, c])).values()];
  for (const c of pairs) {
    const own = await tx.subjectAssignment.findFirst({ where: { status: "ACTIVE", semesterId: c.semesterId, subjectId: c.subjectId, sectionId: c.sectionId } });
    if (own) {
      if (own.facultyId === fromFacultyId) await tx.subjectAssignment.update({ where: { id: own.id }, data: { facultyId: toFacultyId } });
      continue;
    }
    const all = await tx.subjectAssignment.findFirst({ where: { status: "ACTIVE", semesterId: c.semesterId, subjectId: c.subjectId, sectionId: null, facultyId: fromFacultyId } });
    if (all) await tx.subjectAssignment.create({ data: { semesterId: c.semesterId, subjectId: c.subjectId, sectionId: c.sectionId, facultyId: toFacultyId, assignedById: all.assignedById } });
  }
}
