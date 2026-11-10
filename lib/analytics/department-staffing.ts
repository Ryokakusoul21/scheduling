import "server-only";
import { prisma } from "@/lib/db/prisma";
import { activeTermIds } from "@/lib/workload/auto";
import { loadWorkload } from "@/lib/workload/load";
import { maximumFor } from "@/lib/workload/optimizer";
import { summarizeDepartmentStaffing } from "./department-staffing-summary";

export async function departmentStaffing() {
  const [departments, termIds] = await Promise.all([
    prisma.department.findMany({ orderBy: { name: "asc" }, select: { id: true, code: true, name: true } }),
    activeTermIds(),
  ]);
  if (!departments.length) return [];

  const workload = await loadWorkload(termIds, null);
  const faculty = workload.faculty.map((person) => ({
    id: person.id,
    departmentId: person.departmentId,
    maxCapacity: maximumFor(person, workload.limits),
  }));

  return summarizeDepartmentStaffing(departments, faculty, workload.assignments, workload.unassigned, workload.limits.measure);
}
