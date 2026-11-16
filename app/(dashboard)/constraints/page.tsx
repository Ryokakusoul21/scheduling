import { prisma } from "@/lib/db/prisma";
import { SCHEDULING_ROLES } from "@/lib/permissions/roles";
import { canManageDepartment, requireScope } from "@/lib/permissions/scope";
import { departmentWhere } from "@/lib/permissions/department";
import { loadPolicyOptions } from "@/lib/scheduler/policy-options-server";
import { ConstraintsManager } from "./manager";

export const metadata = { title: "Scheduling Constraints - GRANBY COLLEGES OF SCIENCE AND TECHNOLOGY" };

export default async function ConstraintsPage() {
  const scope = await requireScope(...SCHEDULING_ROLES);
  const policyOptions = await loadPolicyOptions(scope);
  const departments = policyOptions.departments ?? [];
  const departmentIds = departments.map((d) => d.value);
  const [constraints, faculty, rooms] = await Promise.all([
    prisma.schedulingConstraint.findMany({
      where: scope.isAdmin ? {} : { OR: [{ departmentId: null }, { departmentId: { in: departmentIds } }] },
      orderBy: [{ kind: "asc" }, { createdAt: "asc" }],
    }),
    prisma.faculty.findMany({ where: { archivedAt: null, ...departmentWhere.faculty(scope) }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true, employmentType: true } }),
    // Room priority: a Head of Department picks only rooms designated to their department.
    prisma.room.findMany({ where: { archivedAt: null, ...(scope.isAdmin ? {} : { departmentId: scope.manageDepartmentId ?? scope.departmentId ?? "" }) }, orderBy: { roomNumber: "asc" }, select: { id: true, roomNumber: true, roomName: true } }),
  ]);
  const names = new Map(departments.map((d) => [d.value, d.label]));
  return <ConstraintsManager
    isAdmin={scope.isAdmin}
    rows={constraints.map((c) => ({ id: c.id, kind: c.kind, name: c.name, params: c.params as Record<string, unknown>, enabled: c.enabled,
      departmentId: c.departmentId, department: c.departmentId ? names.get(c.departmentId) ?? "Unknown department" : "School-wide",
      editable: canManageDepartment(scope, c.departmentId) }))}
    departments={departments}
    faculty={faculty.map((f) => ({ value: f.id, label: f.fullName, partTime: f.employmentType === "PART_TIME" }))}
    rooms={rooms.map((r) => ({ value: r.id, label: r.roomName && r.roomName !== r.roomNumber ? `${r.roomNumber} · ${r.roomName}` : r.roomNumber }))}
    subjects={policyOptions.subjects ?? []}
    policyOptions={policyOptions}
  />;
}
