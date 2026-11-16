import { PageHeader } from "@/components/ux/states";
import { requireScope } from "@/lib/permissions/scope";
import { prisma } from "@/lib/db/prisma";
import { DepartmentManager } from "./manager";
import { conflictingDepartmentHead } from "@/lib/departments/heads";

export const metadata = { title: "Department Management · GRANBY COLLEGES OF SCIENCE AND TECHNOLOGY" };

export default async function DepartmentManagementPage() {
  await requireScope("REGISTRAR");
  const now = new Date();
  const [departments, leaders, facultyCandidates] = await Promise.all([
    prisma.department.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { programs: true, faculty: true, sections: true, rooms: true, subjects: true } }, programs: { orderBy: [{ level: "asc" }, { sortOrder: "asc" }], select: { id: true, code: true, name: true, level: true, _count: { select: { sections: true, subjects: true } } } } },
    }),
    prisma.user.findMany({
      where: { role: "HEAD_OF_DEPARTMENT", status: "ACTIVE", archivedAt: null },
      select: {
        id: true,
        name: true,
        email: true,
        faculty: { select: { departmentId: true } },
        departmentAssignments: {
          select: { departmentId: true, acting: true, startsAt: true, endsAt: true },
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.faculty.findMany({
      where: { status: "ACTIVE", archivedAt: null, user: { role: "FACULTY", status: "ACTIVE", archivedAt: null } },
      select: { id: true, fullName: true, employeeId: true, departmentId: true, position: true },
      orderBy: { fullName: "asc" },
    }),
  ]);

  const rows = departments.map((department) => ({
    id: department.id,
    code: department.code,
    name: department.name,
    logoUrl: department.logoUrl,
    counts: {
      programs: department._count.programs,
      faculty: department._count.faculty,
      sections: department._count.sections,
      rooms: department._count.rooms,
      subjects: department._count.subjects,
    },
    programs: department.programs.map((p) => ({ id: p.id, code: p.code, name: p.name, level: p.level, sections: p._count.sections, subjects: p._count.subjects })),
    facultyCandidates: facultyCandidates.filter((faculty) => faculty.departmentId === department.id).map((faculty) => ({
      id: faculty.id, name: faculty.fullName, detail: [faculty.employeeId, faculty.position].filter(Boolean).join(" · "),
    })),
    headOptions: leaders.filter((candidate) => !conflictingDepartmentHead(leaders.map((leader) => leader.id === candidate.id
      ? { ...leader, departmentAssignments: [...leader.departmentAssignments, { departmentId: department.id, startsAt: null, endsAt: null }] }
      : leader), candidate.id, now)).map((user) => ({ id: user.id, label: `${user.name} · ${user.email}` })),
    heads: leaders.flatMap((leader) => {
      const byFaculty = leader.faculty?.departmentId === department.id;
      const assignment = leader.departmentAssignments.find((item) => item.departmentId === department.id && (!item.startsAt || item.startsAt <= now) && (!item.endsAt || item.endsAt >= now));
      return byFaculty || assignment
        ? [{ id: leader.id, name: leader.name, email: leader.email, acting: assignment?.acting ?? false, linkedThroughFaculty: byFaculty }]
        : [];
    }),
  }));

  return (
    <div className="space-y-5">
      <PageHeader title="Department Management" description="Departments, programs, and heads." />
      <DepartmentManager
        departments={rows}
      />
    </div>
  );
}
