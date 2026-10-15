import { prisma } from "@/lib/db/prisma";
import { STAFF_ROLES } from "@/lib/permissions/roles";
import { canManageDepartment, requireScope } from "@/lib/permissions/scope";
import { ConstraintsManager } from "./manager";

export const metadata = { title: "Scheduling Constraints · GRANBY COLLEGES OF SCIENCE & TECHNOLOGY" };

export default async function ConstraintsPage() {
  const scope = await requireScope(...STAFF_ROLES);
  // A Head of Department sees school-wide rules (read-only) and their own department's rules.
  const [constraints, departments, faculty, subjects] = await Promise.all([
    prisma.schedulingConstraint.findMany({
      where: scope.isAdmin ? {} : { OR: [{ departmentId: null }, { departmentId: scope.manageDepartmentId }] },
      orderBy: [{ kind: "asc" }, { createdAt: "asc" }],
    }),
    prisma.department.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.faculty.findMany({ where: scope.isAdmin ? {} : { departmentId: scope.departmentId }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true } }),
    prisma.subject.findMany({ orderBy: { code: "asc" }, select: { id: true, code: true, name: true } }),
  ]);
  const departmentName = new Map(departments.map((d) => [d.id, d.name]));

  return (
    <ConstraintsManager
      isAdmin={scope.isAdmin}
      rows={constraints.map((c) => ({
        id: c.id,
        kind: c.kind,
        name: c.name,
        params: c.params as Record<string, unknown>,
        enabled: c.enabled,
        departmentId: c.departmentId,
        department: c.departmentId ? (departmentName.get(c.departmentId) ?? "Unknown department") : "Every department",
        editable: canManageDepartment(scope, c.departmentId),
      }))}
      departments={departments.map((d) => ({ value: d.id, label: d.name }))}
      faculty={faculty.map((f) => ({ value: f.id, label: f.fullName }))}
      subjects={subjects.map((s) => ({ value: s.id, label: `${s.code} - ${s.name}` }))}
    />
  );
}
