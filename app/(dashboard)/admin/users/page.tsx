import { PROGRAM_CATALOG_FILTER } from "@/lib/academics/levels";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { NOT_ARCHIVED } from "@/lib/archive/archive";
import { countArchived } from "@/lib/archive/list";
import { UsersManager } from "./manager";
import { UserTabs } from "./user-tabs";
import { PageHeader } from "@/components/ux/states";

export const metadata = { title: "User Management · GRANBY COLLEGES OF SCIENCE AND TECHNOLOGY" };

export default async function UsersPage() {
  const viewer = await requireRole("SUPER_ADMINISTRATOR");
  const now = new Date();
  const [users, allDepartments, archivedCount, programs, faculty] = await Promise.all([
    prisma.user.findMany({
      where: NOT_ARCHIVED,
      orderBy: { createdAt: "desc" },
      select: {
        id: true, name: true, email: true, role: true, status: true, facultyId: true, image: true, createdAt: true, lastLoginAt: true, emailVerified: true, twoFactorEnabled: true,
        faculty: { select: { departmentId: true, fullName: true, employeeId: true, email: true, status: true, archivedAt: true, department: { select: { id: true, name: true } } } },
        student: { select: { studentNumber: true, section: { select: { name: true, department: { select: { id: true, name: true } } } } } },
        departmentAssignments: { where: { AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gte: now } }] }] }, select: { departmentId: true, acting: true, startsAt: true, endsAt: true, department: { select: { id: true, name: true } } } },
        programAssignments: { include: { program: { select: { code: true, name: true } } }, orderBy: { startDate: "asc" } },
      },
    }),
    prisma.department.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    countArchived(),
    prisma.program.findMany({ where: PROGRAM_CATALOG_FILTER, select: { id: true, code: true, name: true, departmentId: true }, orderBy: [{ level: "asc" }, { sortOrder: "asc" }] }),
    prisma.faculty.findMany({ where: { archivedAt: null }, orderBy: { fullName: "asc" }, select: {
      id: true, fullName: true, employeeId: true, email: true, status: true, departmentId: true, department: { select: { name: true } },
      user: { select: { id: true, name: true, email: true, role: true, status: true, archivedAt: true, emailVerified: true } },
    } }),
  ]);
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const departments = [...new Map(users.flatMap((user) => (user.role === "FACULTY" && user.faculty ? [user.faculty.department] : [user.faculty?.department, user.student?.section?.department, ...user.departmentAssignments.map((assignment) => assignment.department)]).filter((department) => !!department)).map((department) => [department.id, department])).values()].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-6">
      <PageHeader title="User Management" description="Review requests and manage access." />
      <UserTabs current="active" archivedCount={archivedCount} />

      <UsersManager
        faculty={faculty.map((f) => ({ id: f.id, fullName: f.fullName, employeeId: f.employeeId, email: f.email, status: f.status,
          departmentId: f.departmentId, departmentName: f.department?.name ?? null,
          account: f.user ? { id: f.user.id, name: f.user.name, email: f.user.email, role: f.user.role, status: f.user.status, archived: !!f.user.archivedAt, emailVerified: !!f.user.emailVerified } : null }))}
        viewerId={viewer.id}
        departments={departments.map((department) => ({ value: department.id, label: department.name }))}
        allDepartments={allDepartments.map((department) => ({ value: department.id, label: department.name }))}
        users={users.map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
          status: u.status,
          facultyId: u.facultyId,
          assignedDepartmentId: u.role === "FACULTY" && u.faculty ? u.faculty.departmentId : u.departmentAssignments.find((a) => !a.acting && !a.startsAt && !a.endsAt)?.departmentId ?? u.faculty?.departmentId ?? null,
          image: u.image,
          createdAt: u.createdAt.toISOString(),
          lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
          emailVerified: !!u.emailVerified,
          twoFactorEnabled: u.twoFactorEnabled,
          facultyLabel: u.faculty ? `${u.faculty.fullName} (${u.faculty.employeeId})` : null,
          facultyArchived: !!u.faculty?.archivedAt,
          facultyStatus: u.faculty?.status ?? null,
          facultyDepartmentName: u.faculty?.department?.name ?? null,
          facultyDepartmentId: u.faculty?.departmentId ?? null,
          facultyContactEmail: u.faculty?.email ?? null,
          studentLabel: u.student ? [u.student.studentNumber, u.student.section?.name].filter(Boolean).join(" · ") : null,
          departmentIds: u.role === "FACULTY" && u.faculty ? (u.faculty.departmentId ? [u.faculty.departmentId] : []) : [...new Set([u.faculty?.department?.id, u.student?.section?.department?.id, ...u.departmentAssignments.map((assignment) => assignment.departmentId)].filter((id): id is string => !!id))],
          departmentNames: u.role === "FACULTY" && u.faculty ? (u.faculty.department ? [u.faculty.department.name] : []) : [...new Set([u.faculty?.department?.name, u.student?.section?.department?.name, ...u.departmentAssignments.map((assignment) => assignment.department.name)].filter((name): name is string => !!name))],
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
