import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { NOT_ARCHIVED } from "@/lib/archive/archive";
import { countArchived } from "@/lib/archive/list";
import { UsersManager } from "./manager";
import { UserTabs } from "./user-tabs";

export const metadata = { title: "User Management · GRANBY COLLEGES OF SCIENCE & TECHNOLOGY" };

export default async function UsersPage() {
  await requireRole("ADMINISTRATOR");
  const [users, faculty, archivedCount] = await Promise.all([
    prisma.user.findMany({ where: NOT_ARCHIVED, orderBy: { createdAt: "desc" } }),
    prisma.faculty.findMany({ where: NOT_ARCHIVED, select: { id: true, fullName: true, employeeId: true }, orderBy: { fullName: "asc" } }),
    countArchived(),
  ]);

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
          createdAt: u.createdAt.toLocaleDateString(),
        }))}
      />
    </div>
  );
}
