import { Suspense } from "react";
import { prisma } from "@/lib/db/prisma";
import type { AppRole } from "@/lib/permissions/roles";
import { ViewAsBanner } from "@/components/layout/view-as";
import { publishDueSubmissions } from "@/lib/scheduler/submissions";
import { requireStudent } from "@/lib/auth/session";
import { Sidebar } from "@/components/layout/sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { ROLE_LABELS } from "@/lib/permissions/roles";
import { Topbar } from "@/components/layout/topbar";
import { ShortcutProvider } from "@/components/ux/shortcuts";
import { AppBreadcrumbs } from "@/components/ux/breadcrumbs";

/** Student portal shell: the same sidebar, top bar, and breadcrumbs as the staff dashboards, limited to student pages. */
export default async function StudentPortalLayout({ children }: { children: React.ReactNode }) {
  const user = await requireStudent();
  // Approved timetables whose publish time has passed go live on the next page load.
  await publishDueSubmissions();
  const [unread, account] = await Promise.all([
    prisma.notification.count({ where: { userId: user.id, isRead: false } }),
    prisma.user.findUnique({ where: { id: user.id }, select: { name: true, image: true, student: { select: { studentNumber: true } } } }),
  ]);
  const studentNumber = account?.student?.studentNumber;

  return (
    <ShortcutProvider allowedHrefs={[]}>
      {user.realId && <ViewAsBanner name={user.name ?? user.email ?? "Account"} role={ROLE_LABELS[user.role as AppRole]} realName={user.realName ?? "Super Administrator"} />}
      <a
        href="#main-content"
        className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Skip to content
      </a>
      <div className={`fixed inset-x-0 bottom-0 ${user.realId ? "top-12" : "top-0"} flex overflow-clip bg-background print:static print:block print:overflow-visible`}>
        <div className="contents print:hidden">
          <Sidebar role="STUDENT" name={account?.name ?? user.name ?? user.email ?? "Student"} image={account?.image} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col overflow-clip print:block print:overflow-visible">
          <div className="contents print:hidden">
            <Topbar
              name={account?.name ?? user.name ?? user.email ?? "Student"}
              email={user.email ?? ""}
              image={account?.image}
              role="STUDENT"
              unreadNotifications={unread}
              subtitle={studentNumber ? `Student number ${studentNumber}` : undefined}
            />
          </div>
          <main id="main-content" tabIndex={-1} className="flex-1 overflow-y-auto p-3 pb-28 outline-none md:pb-4 print:overflow-visible print:p-0 md:p-4">
            <div className="mx-auto max-w-[1600px] space-y-4">
              <Suspense fallback={<div className="h-5" aria-hidden />}>
                <AppBreadcrumbs role="STUDENT" />
              </Suspense>
              {children}
            </div>
          </main>
        </div>
      </div>
      <MobileNav role="STUDENT" name={account?.name ?? user.name ?? user.email ?? "Student"} image={account?.image} roleLabel={ROLE_LABELS.STUDENT} />
    </ShortcutProvider>
  );
}
