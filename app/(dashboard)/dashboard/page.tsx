import Link from "next/link";
import {
  ArrowRight,
  CalendarBlank,
  CalendarDots,
  ClipboardText,
  Clock,
  UploadSimple,
  UserCheck,
  UserMinus,
  Gauge,
  Users,
  WarningOctagon,
} from "@phosphor-icons/react/ssr";
import { prisma } from "@/lib/db/prisma";
import { getScope } from "@/lib/permissions/scope";
import { loadPlan } from "@/lib/occupancy/load";
import { ACADEMIC_LEVELS, LEVELS, levelLabel, termLabel } from "@/lib/academics/levels";
import { activeOverlapConflicts } from "@/lib/scheduler/term-conflicts";
import { formatRange } from "@/lib/scheduler/timetable";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardGrid } from "@/components/ux/card-grid";
import { LEVEL_ACCENTS, LEVEL_ICONS } from "@/components/ux/level-icons";
import { EmptyState, SelectCard } from "@/components/ux/states";
import { AdminPanels } from "@/components/dashboard/admin-panels";
import { FacultyDashboard, HeadDashboard } from "@/components/dashboard/role-dashboards";
import { cn } from "@/lib/utils";

export const metadata = { title: "Dashboard · GRANBY COLLEGES OF SCIENCE & TECHNOLOGY" };

function greeting(hour: number) {
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ term?: string; department?: string; building?: string; view?: string }> }) {
  const scope = await getScope();
  const params = await searchParams;
  const user = { id: scope.userId, name: scope.name };
  const role = scope.role;

  // Manila time for "today" and greetings.
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" }));
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const todayIso = now.toLocaleDateString("en-CA");
  const activeTerms = await prisma.semester.findMany({
    where: { isActive: true },
    include: { program: { select: { code: true } }, academicYear: { select: { name: true } } },
    orderBy: [{ level: "asc" }],
  });
  const activeTermIds = activeTerms.map((t) => t.id);
  const inActiveTerms = { semesterId: { in: activeTermIds }, status: { not: "ARCHIVED" as const } };

  const header = (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-sm text-muted-foreground">
          {now.toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">
          {greeting(now.getHours())}, {(user.name ?? "there").split(" ")[0]}
        </h1>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {activeTerms.length === 0 ? (
            <Badge variant="outline">No active term — set one in Academic Years & Terms</Badge>
          ) : (
            activeTerms.map((t) => (
              <Badge key={t.id} variant="secondary">
                {LEVELS[t.level].short}
                {t.program ? ` ${t.program.code}` : ""} · {termLabel(t.type)}
              </Badge>
            ))
          )}
        </div>
      </div>
      <Button nativeButton={false} render={<Link href="/scheduler" />} aria-keyshortcuts="g s">
        <CalendarDots className="size-4" /> Open Scheduler
      </Button>
    </div>
  );

  // Each role has its own dashboard; Faculty and Heads of Department only ever receive their own scope.
  if (role === "FACULTY") {
    return (
      <div className="space-y-5">
        {header}
        <FacultyDashboard scope={scope} params={params} />
      </div>
    );
  }
  if (role === "HEAD_OF_DEPARTMENT") {
    return (
      <div className="space-y-5">
        {header}
        <HeadDashboard scope={scope} params={params} />
      </div>
    );
  }

  // Today's real sessions school-wide, after room bookings, substitutions, suspensions, and holidays.
  const plan = await loadPlan(todayIso, todayIso);
  const todaysClasses = plan.sessions
    .filter((s) => s.endMin >= nowMin)
    .slice(0, 6)
    .map((s) => ({
      id: `${s.scheduleId}-${s.date}`,
      startMin: s.startMin,
      endMin: s.endMin,
      moved: s.status !== "REGULAR",
      subject: { code: plan.classInfo.get(s.scheduleId)?.subjectCode ?? "" },
      section: { name: plan.classInfo.get(s.scheduleId)?.sectionName ?? "" },
      room: { roomName: plan.roomName.get(s.roomId) ?? "" },
      faculty: { fullName: plan.facultyName.get(s.facultyId) ?? "" },
    }));

  const todayCard = (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock className="size-4 text-primary" /> Coming up today
        </CardTitle>
      </CardHeader>
      <CardContent>
        {todaysClasses.length === 0 ? (
          <p className="text-sm text-muted-foreground">No more classes today.</p>
        ) : (
          <ul className="space-y-2">
            {todaysClasses.map((c) => (
              <li key={c.id} className="flex items-start gap-3 rounded-lg border p-2.5 text-sm">
                <span className="w-24 shrink-0 text-xs font-medium text-muted-foreground">{formatRange(c.startMin, c.endMin)}</span>
                <span className="min-w-0">
                  <span className="block truncate font-medium">
                    {c.subject.code} · {c.section.name}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {c.room.roomName}
                    {` · ${c.faculty.fullName}`}
                    {c.moved && " · Rescheduled"}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );

  // ---------------------------------------------------------------------------
  // Administrator: school-wide overview
  // ---------------------------------------------------------------------------
  const [
    sectionsByLevel,
    subjectsByLevel,
    conflicts,
    toPublish,
    pendingRequests,
    pendingAccounts,
    facultyLoad,
    activeClasses,
    recentAudit,
    pendingReports,
    pendingProposals,
  ] = await Promise.all([
    prisma.section.groupBy({ by: ["level"], _count: true }),
    prisma.subject.groupBy({ by: ["level"], _count: true }),
    activeOverlapConflicts(),
    prisma.schedule.count({ where: { ...inActiveTerms, status: { in: ["DRAFT", "REVIEW"] } } }),
    prisma.scheduleRequest.count({ where: { status: "PENDING" } }),
    prisma.user.count({ where: { status: "PENDING", emailVerified: { not: null } } }),
    prisma.faculty.findMany({
      where: { status: "ACTIVE" },
      select: { maxHours: true, schedules: { where: inActiveTerms, select: { startMin: true, endMin: true } } },
    }),
    prisma.schedule.findMany({ where: inActiveTerms, select: { sectionId: true, section: { select: { level: true } } } }),
    prisma.auditLog.findMany({ take: 6, orderBy: { createdAt: "desc" }, include: { user: { select: { name: true } } } }),
    prisma.unavailability.count({ where: { status: "PENDING" } }),
    prisma.workloadProposal.count({ where: { status: "PENDING" } }),
  ]);

  const countFor = (rows: { level: string; _count: number }[], level: string) => rows.find((r) => r.level === level)?._count ?? 0;
  const totalSections = sectionsByLevel.reduce((s, r) => s + r._count, 0);
  const overloaded = facultyLoad.filter((f) => f.schedules.reduce((s, e) => s + e.endMin - e.startMin, 0) / 60 > f.maxHours).length;
  const scheduledSections = new Set(activeClasses.map((c) => c.sectionId));

  const attention = [
    {
      show: conflicts.length > 0,
      icon: WarningOctagon,
      tone: "text-red-600 bg-red-500/10",
      title: `${conflicts.length} double-booking conflict${conflicts.length === 1 ? "" : "s"}`,
      detail: "Room, faculty, or section overlaps in active terms",
      href: "/scheduler",
    },
    {
      show: toPublish > 0,
      icon: UploadSimple,
      tone: "text-blue-600 bg-blue-500/10",
      title: `${toPublish} class${toPublish === 1 ? "" : "es"} awaiting approval`,
      detail: "Drafts and edits sent for review; approve and publish them in the Scheduler",
      href: "/scheduler",
    },
    {
      show: pendingRequests > 0,
      icon: ClipboardText,
      tone: "text-amber-600 bg-amber-500/10",
      title: `${pendingRequests} pending schedule request${pendingRequests === 1 ? "" : "s"}`,
      detail: "Faculty waiting for a decision",
      href: "/requests",
    },
    {
      show: pendingReports > 0,
      icon: UserMinus,
      tone: "text-rose-600 bg-rose-500/10",
      title: `${pendingReports} faculty unavailability report${pendingReports === 1 ? "" : "s"}`,
      detail: "Review and reassign or cancel the affected classes",
      href: "/adjustments",
    },
    {
      show: pendingProposals > 0,
      icon: Gauge,
      tone: "text-indigo-600 bg-indigo-500/10",
      title: `${pendingProposals} workload proposal${pendingProposals === 1 ? "" : "s"} awaiting approval`,
      detail: "Suggested teaching load reassignments",
      href: "/workload",
    },
    {
      show: pendingAccounts > 0,
      icon: UserCheck,
      tone: "text-violet-600 bg-violet-500/10",
      title: `${pendingAccounts} account${pendingAccounts === 1 ? "" : "s"} awaiting approval`,
      detail: "Verified registrations need the Administrator",
      href: "/admin/users",
    },
    {
      show: overloaded > 0,
      icon: Users,
      tone: "text-orange-600 bg-orange-500/10",
      title: `${overloaded} faculty over their maximum hours`,
      detail: "Check teaching loads",
      href: "/workload",
    },
    {
      show: totalSections - scheduledSections.size > 0 && activeTerms.length > 0,
      icon: CalendarBlank,
      tone: "text-slate-600 bg-slate-500/10",
      title: `${totalSections - scheduledSections.size} section${totalSections - scheduledSections.size === 1 ? "" : "s"} with no classes`,
      detail: "Nothing scheduled yet in the active terms",
      href: "/scheduler",
    },
  ].filter((a) => a.show);

  const classesByLevel = (level: string) => activeClasses.filter((c) => c.section.level === level);

  const levelCards = (
    <section aria-labelledby="lv-title" className="space-y-2">
      <h2 id="lv-title" className="text-sm font-semibold text-muted-foreground">
        By academic level (active terms)
      </h2>
      <CardGrid label="Academic levels" className="sm:grid-cols-2 xl:grid-cols-4">
        {ACADEMIC_LEVELS.map((l) => {
          const sections = countFor(sectionsByLevel, l);
          const classes = classesByLevel(l);
          const covered = new Set(classes.map((c) => c.sectionId)).size;
          const pct = sections ? Math.round((covered / sections) * 100) : 0;
          return (
            <SelectCard
              key={l}
              href={`/scheduler?level=${l}`}
              icon={LEVEL_ICONS[l]}
              accent={LEVEL_ACCENTS[l]}
              title={levelLabel(l)}
              subtitle={`${sections} sections · ${countFor(subjectsByLevel, l)} subjects · ${classes.length} classes`}
            >
              <div className="mt-3">
                <div className="flex justify-between text-[11px] text-muted-foreground">
                  <span>Sections with a timetable</span>
                  <span>
                    {covered}/{sections}
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                  <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                </div>
              </div>
            </SelectCard>
          );
        })}
      </CardGrid>
    </section>
  );

  return (
    <div className="space-y-5">
      {header}

      <AdminPanels scope={scope} params={params} levels={levelCards} />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="h-full">
          <CardHeader>
            <CardTitle className="text-base">Needs attention</CardTitle>
          </CardHeader>
          <CardContent>
            {attention.length === 0 ? (
              <EmptyState title="All clear" description="No conflicts, pending requests, or unpublished classes." className="py-6" />
            ) : (
              <ul className="space-y-2">
                {attention.map((a) => (
                  <li key={a.title}>
                    <Link href={a.href} className="flex items-center gap-3 rounded-lg border p-2.5 text-sm transition-colors hover:bg-accent">
                      <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-md", a.tone)}>
                        <a.icon className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{a.title}</span>
                        <span className="block truncate text-xs text-muted-foreground">{a.detail}</span>
                      </span>
                      <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {todayCard}

        <Card className="h-full">
          <CardHeader>
            <CardTitle className="text-base">Recent activity</CardTitle>
          </CardHeader>
          <CardContent>
            {recentAudit.length === 0 ? (
              <p className="text-sm text-muted-foreground">No activity yet.</p>
            ) : (
              <ul className="space-y-2.5 text-sm">
                {recentAudit.map((log) => (
                  <li key={log.id} className="flex gap-2">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                    <span className="min-w-0">
                      <span className="block truncate">{log.action}</span>
                      <span className="block text-xs text-muted-foreground">
                        {log.user?.name ?? "System"} · {log.createdAt.toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" })}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <Link href="/admin/audit-logs" className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
              View audit log <ArrowRight className="size-3" />
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
