import { prisma } from "@/lib/db/prisma";
import type { AppRole } from "@/lib/permissions/roles";
import { ViewAsBanner } from "@/components/layout/view-as";
import { publishDueSubmissions } from "@/lib/scheduler/submissions";
import { requireStudent } from "@/lib/auth/session";
import { ROLE_LABELS } from "@/lib/permissions/roles";
import { Topbar } from "@/components/layout/topbar";
import { ShortcutProvider } from "@/components/ux/shortcuts";
import { StudentNavigation } from "@/components/student/navigation";
import { IdleSession } from "@/components/auth/idle-session";

/** A focused student workspace with direct navigation and no notification inbox. */
export default async function StudentPortalLayout({ children }: { children: React.ReactNode }) {
  const user = await requireStudent();
  await publishDueSubmissions();
  const account = await prisma.user.findUnique({ where: { id: user.id }, select: { name: true, image: true, student: { select: { studentNumber: true } } } });
  const name = account?.name ?? user.name ?? user.email ?? "Student";
  const studentNumber = account?.student?.studentNumber;

  return (
    <ShortcutProvider allowedHrefs={[]}>
      <IdleSession sessionKey={user.sessionId ?? user.realId ?? user.id} student />
      {user.realId && <ViewAsBanner name={name} role={ROLE_LABELS[user.role as AppRole]} realName={user.realName ?? "Administrator"} />}
      <a href="#main-content" className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3">Skip to content</a>
      <div data-student-shell className={`fixed inset-x-0 bottom-0 ${user.realId ? "top-12" : "top-0"} flex overflow-clip bg-slate-50 dark:bg-background print:static print:block print:overflow-visible`}>
        <StudentNavigation name={name} image={account?.image} studentNumber={studentNumber} />
        <div className="flex min-w-0 flex-1 flex-col overflow-clip print:block print:overflow-visible">
          <div className="contents print:hidden"><Topbar userId={user.id} name={name} email={user.email ?? ""} image={account?.image} role="STUDENT" subtitle={studentNumber ? `Student number ${studentNumber}` : undefined} /></div>
          <main id="main-content" tabIndex={-1} className="min-h-0 flex-1 overflow-y-auto px-4 pt-6 pb-[calc(6rem+env(safe-area-inset-bottom))] outline-none sm:px-6 md:pb-8 lg:px-8 lg:pt-8 print:overflow-visible print:p-0">
            <div className="mx-auto max-w-[1440px]">{children}</div>
          </main>
        </div>
      </div>
    </ShortcutProvider>
  );
}
