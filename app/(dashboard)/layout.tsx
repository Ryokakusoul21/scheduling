import { requireUser } from "@/lib/auth/session";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { prisma } from "@/lib/db/prisma";
import type { AppRole } from "@/lib/permissions/roles";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  const unread = await prisma.notification.count({
    where: { userId: user.id, isRead: false },
  });

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <Sidebar role={user.role as AppRole} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar
          name={user.name ?? user.email ?? "User"}
          email={user.email ?? ""}
          role={user.role as AppRole}
          unreadNotifications={unread}
        />
        <main className="flex-1 overflow-y-auto p-3 md:p-4">{children}</main>
      </div>
    </div>
  );
}
