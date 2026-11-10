import { Suspense } from "react";
import { requireUser } from "@/lib/auth/session";
import { Sidebar } from "@/components/layout/sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { ROLE_LABELS } from "@/lib/permissions/roles";
import { Topbar } from "@/components/layout/topbar";
import { allowedHrefsForRole } from "@/components/layout/nav-config";
import { ShortcutProvider } from "@/components/ux/shortcuts";
import { prisma } from "@/lib/db/prisma";
import { ViewAsBanner } from "@/components/layout/view-as";
import { publishDueSubmissions } from "@/lib/scheduler/submissions";
import type { AppRole } from "@/lib/permissions/roles";
import { AppBreadcrumbs } from "@/components/ux/breadcrumbs";
import { SectionTabs } from "@/components/layout/section-tabs";
import { notificationVisibility } from "@/lib/permissions/notifications";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const role = user.role as AppRole;

  // Approved timetables whose publish time has passed go live on the next page load.
  await publishDueSubmissions();
  const [unread, account] = await Promise.all([
    prisma.notification.count({ where: { userId: user.id, isRead: false, ...notificationVisibility(role) } }),
    prisma.user.findUnique({ where: { id: user.id }, select: { name: true, image: true, faculty: { select: { department: { select: { name: true } } } } } }),
  ]);

  return (
    <ShortcutProvider allowedHrefs={allowedHrefsForRole(role)}>
      {user.realId && <ViewAsBanner name={user.name ?? user.email ?? "Account"} role={ROLE_LABELS[user.role as AppRole]} realName={user.realName ?? "Administrator"} />}
      <a
        href="#main-content"
        className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Skip to content
      </a>
      <div className={`fixed inset-x-0 bottom-0 ${user.realId ? "top-12" : "top-0"} flex overflow-clip bg-background print:static print:block print:overflow-visible`}>
        <Sidebar role={role} name={account?.name ?? user.name ?? user.email ?? "User"} image={account?.image} />
        <div className="flex min-w-0 flex-1 flex-col overflow-clip print:block print:overflow-visible">
          <Topbar
            name={account?.name ?? user.name ?? user.email ?? "User"}
            email={user.email ?? ""}
            image={account?.image}
            role={role}
            unreadNotifications={unread}
          />
          <main id="main-content" tabIndex={-1} className="mb-[calc(6.5rem+env(safe-area-inset-bottom))] min-h-0 flex-1 overflow-y-auto p-3 outline-none md:mb-0 print:m-0 print:overflow-visible print:p-0 lg:[&:has([data-viewport-lock])]:overflow-hidden md:p-4">
            <div className="space-y-3 lg:has-[[data-viewport-lock]]:h-full">
              <Suspense fallback={<div className="h-5" aria-hidden />}><AppBreadcrumbs role={role} departmentName={account?.faculty?.department?.name} /></Suspense>
              <SectionTabs role={role} />
              {children}
            </div>
          </main>
        </div>
      </div>
      <MobileNav role={role} name={account?.name ?? user.name ?? user.email ?? "User"} image={account?.image} roleLabel={ROLE_LABELS[role]} />
    </ShortcutProvider>
  );
}
