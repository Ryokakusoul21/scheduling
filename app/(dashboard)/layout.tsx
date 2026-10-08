import { requireUser } from "@/lib/auth/session";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { allowedHrefsForRole } from "@/components/layout/nav-config";
import { ShortcutProvider } from "@/components/ux/shortcuts";
import { prisma } from "@/lib/db/prisma";
import type { AppRole } from "@/lib/permissions/roles";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const role = user.role as AppRole;

  const unread = await prisma.notification.count({
    where: { userId: user.id, isRead: false },
  });

  return (
    <ShortcutProvider allowedHrefs={allowedHrefsForRole(role)}>
      <a
        href="#main-content"
        className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Skip to content
      </a>
      <div className="flex h-screen w-full overflow-hidden bg-background">
        <Sidebar role={role} />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Topbar
            name={user.name ?? user.email ?? "User"}
            email={user.email ?? ""}
            role={role}
            unreadNotifications={unread}
          />
          <main id="main-content" tabIndex={-1} className="flex-1 overflow-y-auto p-3 outline-none md:p-4">
            {children}
          </main>
        </div>
      </div>
    </ShortcutProvider>
  );
}
