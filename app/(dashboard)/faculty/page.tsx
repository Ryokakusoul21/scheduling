import { prisma } from "@/lib/db/prisma";
import { STAFF_ROLES } from "@/lib/permissions/roles";
import { requireScope } from "@/lib/permissions/scope";
import { FacultyBrowser } from "./faculty-browser";
import { loadWorkload } from "@/lib/workload/load";
import { loadReport } from "@/lib/workload/optimizer";
import { activeTermIds } from "@/lib/workload/auto";

export const metadata = { title: "Faculty · GRANBY COLLEGES OF SCIENCE & TECHNOLOGY" };

export default async function FacultyPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const scope = await requireScope(...STAFF_ROLES);
  const { q } = await searchParams;
  // A Head of Department sees and manages their own department's faculty.
  const own = scope.isAdmin ? {} : { departmentId: scope.manageDepartmentId };
  const [faculty, departments, workload] = await Promise.all([
    prisma.faculty.findMany({
      where: { ...own, archivedAt: null },
      include: {
        department: { select: { code: true, name: true } },
        user: { select: { image: true } },
        // Teaching load counts classes in currently active terms only.
        schedules: { where: { status: { not: "ARCHIVED" }, semester: { isActive: true } }, select: { startMin: true, endMin: true } },
      },
      orderBy: { fullName: "asc" },
    }),
    prisma.department.findMany({ where: scope.isAdmin ? {} : { id: scope.manageDepartmentId ?? "__none__" }, orderBy: { name: "asc" } }),
    // Load and status come from the workload engine, the same numbers as Faculty Workload.
    activeTermIds().then((ids) => loadWorkload(ids, null)),
  ]);
  const loads = new Map(loadReport(workload.faculty, workload.assignments, workload.limits).map((r) => [r.facultyId, r]));

  return (
    <FacultyBrowser
      initialQuery={q ?? ""}
      departments={departments.map((d) => ({ value: d.id, label: d.name }))}
      faculty={faculty.map((f) => ({
        id: f.id,
        employeeId: f.employeeId,
        fullName: f.fullName,
        image: f.user?.image ?? null,
        email: f.email,
        position: f.position ?? "",
        specialization: f.specialization ?? "",
        departmentId: f.departmentId ?? "",
        department: f.department?.name ?? null,
        maxHours: f.maxHours,
        employmentType: f.employmentType,
        dayOff: f.dayOff ?? "",
        status: f.status,
        teachingLevels: f.teachingLevels,
        load: loads.get(f.id) ?? null,
        loadUnit: workload.limits.measure === "HOURS" ? "hours" : "units",
        classes: f.schedules.length,
      }))}
    />
  );
}
