import { PROGRAM_CATALOG_FILTER } from "@/lib/academics/levels";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { NOT_ARCHIVED } from "@/lib/archive/archive";
import { countArchived } from "@/lib/archive/list";
import { UsersManager } from "./manager";
import { UserTabs } from "./user-tabs";

export const metadata = { title: "User Management · GRANBY COLLEGES OF SCIENCE AND TECHNOLOGY" };

export default async function UsersPage() {
  await requireRole("SUPER_ADMINISTRATOR");
  const [users, faculty, archivedCount, programs] = await Promise.all([
    prisma.user.findMany({
      where: NOT_ARCHIVED,
      orderBy: { createdAt: "desc" },
      include: {
        faculty: { select: { departmentId: true } },
        departmentAssignments: { select: { departmentId: true } },
        programAssignments: { include: { program: { select: { code: true, name: true } } }, orderBy: { startDate: "asc" } },
      },
    }),
    prisma.faculty.findMany({ where: NOT_ARCHIVED, select: { id: true, fullName: true, employeeId: true }, orderBy: { fullName: "asc" } }),
    countArchived(),
    prisma.program.findMany({ where: PROGRAM_CATALOG_FILTER, select: { id: true, code: true, name: true, departmentId: true }, orderBy: [{ level: "asc" }, { sortOrder: "asc" }] }),
  ]);
  const day = (d: Date) => d.toISOString().slice(0, 10);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">User Management</h1>
        <p className="text-sm text-muted-foreground">Manage login accounts and roles for the scheduling system.</p>
      </div>
      <UserTabs current="active" archivedCount={archivedCount} />

      <UsersManager
        faculty={faculty.map((f) => ({ value: f.id, label: `${f.fullName} (${f.employeeId})` }))}
        users={users.map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
          status: u.status,
          facultyId: u.facultyId,
          image: u.image,
          createdAt: u.createdAt.toLocaleDateString(),
          // Only programs of the head's own department can be assigned.
          programOptions: programs
            .filter((p) => [u.faculty?.departmentId, ...u.departmentAssignments.map((a) => a.departmentId)].includes(p.departmentId))
            .map((p) => ({ id: p.id, label: `${p.name} (${p.code})` })),
          assignments: u.programAssignments.map((a) => ({
            id: a.id, programId: a.programId, label: `${a.program.name} (${a.program.code})`, isActing: a.isActing, startDate: day(a.startDate), endDate: a.endDate ? day(a.endDate) : null,
          })),
        }))}
      />
    </div>
  );
}
