import { PageHeader } from "@/components/ux/states";
import { requireScope } from "@/lib/permissions/scope";
import { prisma } from "@/lib/db/prisma";
import { DepartmentManager } from "./manager";

export const metadata = { title: "Department Management · GRANBY COLLEGES OF SCIENCE AND TECHNOLOGY" };

export default async function DepartmentManagementPage() {
  await requireScope("REGISTRAR", "SUPER_ADMINISTRATOR");
  const now = new Date();
  const [departments, leaders] = await Promise.all([
    prisma.department.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { programs: true, faculty: true, sections: true, rooms: true } } },
    }),
    prisma.user.findMany({
      where: { role: "HEAD_OF_DEPARTMENT", status: "ACTIVE", archivedAt: null },
      select: {
        id: true,
        name: true,
        email: true,
        faculty: { select: { departmentId: true } },
        departmentAssignments: {
          where: { AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gte: now } }] }] },
          select: { departmentId: true, acting: true },
        },
      },
      orderBy: { name: "asc" },
    }),
  ]);

  const rows = departments.map((department) => ({
    id: department.id,
    code: department.code,
    name: department.name,
    counts: {
      programs: department._count.programs,
      faculty: department._count.faculty,
      sections: department._count.sections,
      rooms: department._count.rooms,
    },
    heads: leaders.flatMap((leader) => {
      const byFaculty = leader.faculty?.departmentId === department.id;
      const assignment = leader.departmentAssignments.find((item) => item.departmentId === department.id);
      return byFaculty || assignment
        ? [{ id: leader.id, name: leader.name, email: leader.email, acting: assignment?.acting ?? false, linkedThroughFaculty: byFaculty }]
        : [];
    }),
  }));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Department Management"
        description="Maintain department records, assign active Heads of Department, and review each department’s academic and staffing footprint."
      />
      <DepartmentManager
        departments={rows}
        headOptions={leaders.map((user) => ({ id: user.id, label: `${user.name} · ${user.email}` }))}
      />
    </div>
  );
}
