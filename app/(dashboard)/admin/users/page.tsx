import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { UsersManager } from "./manager";

export const metadata = { title: "User Management · GCST Scheduling" };

export default async function UsersPage() {
  await requireRole("SUPER_ADMIN", "ADMINISTRATOR");
  const users = await prisma.user.findMany({ orderBy: { createdAt: "desc" } });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">User Management</h1>
        <p className="text-sm text-muted-foreground">Manage login accounts and roles for the scheduling system.</p>
      </div>

      <UsersManager
        users={users.map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
          status: u.status,
          createdAt: u.createdAt.toLocaleDateString(),
        }))}
      />
    </div>
  );
}
