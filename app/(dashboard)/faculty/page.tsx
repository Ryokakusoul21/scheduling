import { prisma } from "@/lib/db/prisma";
import { STAFF_ROLES } from "@/lib/permissions/roles";
import { requireScope } from "@/lib/permissions/scope";
import { FacultyBrowser } from "./faculty-browser";

export const metadata = { title: "Faculty · GRANBY COLLEGES OF SCIENCE & TECHNOLOGY" };

export default async function FacultyPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const scope = await requireScope(...STAFF_ROLES);
  const { q } = await searchParams;
  // A Head of Department sees and manages their own department's faculty.
  const own = scope.isAdmin ? {} : { departmentId: scope.manageDepartmentId };
  const [faculty, departments] = await Promise.all([
    prisma.faculty.findMany({
      where: own,
      include: {
        department: { select: { code: true, name: true } },
        // Teaching load counts classes in currently active terms only.
        schedules: { where: { status: { not: "ARCHIVED" }, semester: { isActive: true } }, select: { startMin: true, endMin: true } },
      },
      orderBy: { fullName: "asc" },
    }),
    prisma.department.findMany({ where: scope.isAdmin ? {} : { id: scope.manageDepartmentId ?? "__none__" }, orderBy: { name: "asc" } }),
  ]);

  return (
    <FacultyBrowser
      initialQuery={q ?? ""}
      departments={departments.map((d) => ({ value: d.id, label: d.name }))}
      faculty={faculty.map((f) => ({
        id: f.id,
        employeeId: f.employeeId,
        fullName: f.fullName,
        email: f.email,
        position: f.position ?? "",
        specialization: f.specialization ?? "",
        departmentId: f.departmentId ?? "",
        department: f.department?.name ?? null,
        maxHours: f.maxHours,
        status: f.status,
        teachingLevels: f.teachingLevels,
        loadHours: Math.round((f.schedules.reduce((s, e) => s + (e.endMin - e.startMin), 0) / 60) * 10) / 10,
        classes: f.schedules.length,
      }))}
    />
  );
}
