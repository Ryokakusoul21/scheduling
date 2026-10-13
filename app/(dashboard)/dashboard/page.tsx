import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BookOpen,
  Buildings,
  CalendarBlank,
  CalendarDots,
  ClipboardText,
  Clock,
  Gear,
  Stack,
  UploadSimple,
  UserCheck,
  UserMinus,
  Gauge,
  DoorOpen,
  ArrowsClockwise,
  ChartLineUp,
  CalendarCheck,
  UserSquare,
  Users,
  UsersThree,
  WarningOctagon,
  Bell,
  Robot,
  ChartBar,
} from "@phosphor-icons/react/ssr";
import { prisma } from "@/lib/db/prisma";
import { getScope } from "@/lib/permissions/scope";
import { loadPlan } from "@/lib/occupancy/load";
import { ACADEMIC_LEVELS, LEVELS, levelLabel, termLabel } from "@/lib/academics/levels";
import { recordAndGetTrend } from "@/lib/analytics/dailyStat";
import { activeOverlapConflicts } from "@/lib/scheduler/term-conflicts";
import { formatRange } from "@/lib/scheduler/timetable";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardGrid } from "@/components/ux/card-grid";
import { Kbd } from "@/components/ux/kbd";
import { LEVEL_ACCENTS, LEVEL_ICONS } from "@/components/ux/level-icons";
import { EmptyState, SelectCard } from "@/components/ux/states";
import { AssistantChat, AssistantHeader } from "@/components/assistant/assistant-chat";
import { getAssistantHistory } from "../assistant/actions";
import { MyTeaching } from "@/components/dashboard/my-teaching";
import { cn } from "@/lib/utils";

export const metadata = { title: "Dashboard · GRANBY COLLEGES OF SCIENCE & TECHNOLOGY" };

function greeting(hour: number) {
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

function TrendBadge({ value, invert = false }: { value: number | null | undefined; invert?: boolean }) {
  if (value === null || value === undefined) return null;
  if (value === 0) return <span className="text-[10px] text-muted-foreground">No change</span>;
  const up = value > 0;
  const good = invert ? !up : up;
  return (
    <span className={cn("flex items-center gap-0.5 text-[10px] font-medium", good ? "text-emerald-600" : "text-red-600")}>
      {up ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
      {Math.abs(value)}%
    </span>
  );
}

export default async function DashboardPage() {
  const scope = await getScope();
  const user = { id: scope.userId, name: scope.name };
  const role = scope.role;
  const staff = role !== "FACULTY";
  const admin = scope.isAdmin;
  // Head of Department figures cover their own department only.
  const dept = admin ? null : scope.manageDepartmentId;

  // Manila time for "today" and greetings.
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" }));
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const todayIso = now.toLocaleDateString("en-CA");
  const [activeTerms, plan] = await Promise.all([
    prisma.semester.findMany({
      where: { isActive: true },
      include: { program: { select: { code: true } }, academicYear: { select: { name: true } } },
      orderBy: [{ level: "asc" }],
    }),
    loadPlan(todayIso, todayIso),
  ]);
  const me = { facultyId: scope.facultyId };
  const activeTermIds = activeTerms.map((t) => t.id);
  const inActiveTerms = { semesterId: { in: activeTermIds }, status: { not: "ARCHIVED" as const } };

  // Today's real sessions, after room bookings, substitutions, suspensions, and holidays.
  const todaysClasses = plan.sessions
    .filter((s) => s.endMin >= nowMin)
    .filter((s) => (role === "FACULTY" ? s.facultyId === me.facultyId : !dept || plan.classInfo.get(s.scheduleId)?.departmentId === dept || s.facultyId === me.facultyId))
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

  const todayCard = (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock className="size-4 text-primary" /> {role === "FACULTY" ? "Your classes today" : "Coming up today"}
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
                    {role !== "FACULTY" && ` · ${c.faculty.fullName}`}
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

  const myTeaching = <MyTeaching facultyId={me.facultyId} userId={user.id} activeTermIds={activeTermIds} />;

  // ---------------------------------------------------------------------------
  // Faculty: a focused personal view
  // ---------------------------------------------------------------------------
  if (!staff) {
    const history = await getAssistantHistory();
    const links = [
      { label: "My timetable", href: me.facultyId ? `/scheduler?facultyId=${me.facultyId}` : "/scheduler", icon: CalendarDots },
      { label: "Calendar of Activities", href: "/calendar?scope=mine", icon: CalendarCheck },
      { label: "Book a room", href: "/bookings", icon: DoorOpen },
      { label: "Report unavailability", href: "/availability", icon: UserMinus },
      { label: "My teaching load", href: "/workload", icon: Gauge },
      { label: "Schedule requests", href: "/requests", icon: ClipboardText },
      { label: "Notifications", href: "/notifications", icon: Bell },
      { label: "Scheduling Assistant", href: "/assistant", icon: Robot },
    ];
    return (
      <div className="space-y-5">
        {header}
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(380px,36%)]">
          <div className="space-y-4">
            {todayCard}
            {myTeaching}
            <CardGrid label="Quick links" className="xl:grid-cols-2">
              {links.map((l) => (
                <SelectCard key={l.href} href={l.href} icon={l.icon} title={l.label} />
              ))}
            </CardGrid>
          </div>
          <Card className="gap-0 py-0">
            <div className="border-b p-4">
              <AssistantHeader />
            </div>
            <AssistantChat initialMessages={history} userName={user.name} staff={false} className="h-[min(36rem,70dvh)]" />
          </Card>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Administrator (whole school) and Head of Department (own department) overview
  // ---------------------------------------------------------------------------
  const inDept = dept ? { program: { departmentId: dept } } : {};
  const deptSectionIds = dept ? new Set((await prisma.section.findMany({ where: inDept, select: { id: true } })).map((s) => s.id)) : null;
  const [
    sectionsByLevel,
    subjectsByLevel,
    totalFaculty,
    totalRooms,
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
    prisma.section.groupBy({ by: ["level"], where: inDept, _count: true }),
    prisma.subject.groupBy({ by: ["level"], where: inDept, _count: true }),
    prisma.faculty.count({ where: { status: "ACTIVE", ...(dept ? { departmentId: dept } : {}) } }),
    prisma.room.count({ where: dept ? { departmentId: dept } : {} }),
    activeOverlapConflicts().then((all) => (deptSectionIds ? all.filter((c) => deptSectionIds.has(c.entryA.sectionId) || (c.entryB && deptSectionIds.has(c.entryB.sectionId))) : all)),
    prisma.schedule.count({ where: { ...inActiveTerms, status: { in: ["DRAFT", "REVIEW"] }, ...(dept ? { section: inDept } : {}) } }),
    prisma.scheduleRequest.count({ where: { status: "PENDING" } }),
    admin ? prisma.user.count({ where: { status: "PENDING", emailVerified: { not: null } } }) : Promise.resolve(0),
    prisma.faculty.findMany({
      where: { status: "ACTIVE", ...(dept ? { departmentId: dept } : {}) },
      select: { maxHours: true, schedules: { where: inActiveTerms, select: { startMin: true, endMin: true } } },
    }),
    prisma.schedule.findMany({ where: { ...inActiveTerms, ...(dept ? { section: inDept } : {}) }, select: { sectionId: true, section: { select: { level: true } } } }),
    admin ? prisma.auditLog.findMany({ take: 6, orderBy: { createdAt: "desc" }, include: { user: { select: { name: true } } } }) : Promise.resolve([]),
    prisma.unavailability.count({ where: { status: "PENDING", ...(dept ? { faculty: { departmentId: dept } } : {}) } }),
    prisma.workloadProposal.count({ where: { status: "PENDING", ...(dept ? { departmentId: dept } : {}) } }),
  ]);

  const countFor = (rows: { level: string; _count: number }[], level: string) => rows.find((r) => r.level === level)?._count ?? 0;
  const totalSections = sectionsByLevel.reduce((s, r) => s + r._count, 0);
  const totalSubjects = subjectsByLevel.reduce((s, r) => s + r._count, 0);
  const overloaded = facultyLoad.filter((f) => f.schedules.reduce((s, e) => s + e.endMin - e.startMin, 0) / 60 > f.maxHours).length;
  const scheduledSections = new Set(activeClasses.map((c) => c.sectionId));

  // Day-over-day trends are school-wide, so only the Administrator sees them.
  const trend = admin
    ? await recordAndGetTrend({ totalSections, totalFaculty, totalSubjects, totalRooms, openConflicts: conflicts.length })
    : { totalSections: null, totalFaculty: null, totalSubjects: null, totalRooms: null, openConflicts: null };

  const stats = [
    { label: "Sections", value: totalSections, icon: UsersThree, href: "/sections", trend: trend.totalSections },
    { label: "Active faculty", value: totalFaculty, icon: UserSquare, href: "/faculty", trend: trend.totalFaculty },
    { label: "Subjects", value: totalSubjects, icon: BookOpen, href: "/subjects", trend: trend.totalSubjects },
    { label: "Rooms", value: totalRooms, icon: Buildings, href: "/rooms", trend: trend.totalRooms },
    {
      label: "Schedule conflicts",
      value: conflicts.length,
      icon: WarningOctagon,
      href: "/scheduler",
      trend: trend.openConflicts,
      invert: true,
      danger: conflicts.length > 0,
    },
  ];

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

  const quickActions = [
    { label: "Scheduler", hint: "g s", href: "/scheduler", icon: CalendarDots, description: "Build and fix timetables" },
    ...(admin ? [{ label: "Academic Years & Terms", hint: "g y", href: "/academic-years", icon: CalendarBlank, description: "Semesters and quarters" }] : []),
    { label: "Calendar of Activities", hint: "g c", href: "/calendar", icon: CalendarCheck, description: "Classes, examinations, events" },
    { label: "Schedule Adjustments", hint: "", href: "/adjustments", icon: ArrowsClockwise, description: "Unavailability and suspensions" },
    { label: "Faculty Workload", hint: "", href: "/workload", icon: Gauge, description: "Balance teaching loads" },
    { label: "Enrollment Forecast", hint: "", href: "/forecast", icon: ChartLineUp, description: "Sections, faculty, rooms needed" },
    { label: "Programs & Strands", hint: "g p", href: "/programs", icon: Stack, description: "Courses and Senior High School strands" },
    { label: "Sections", hint: "g e", href: "/sections", icon: UsersThree, description: "Basic education and college sections" },
    { label: "Subjects", hint: "g u", href: "/subjects", icon: BookOpen, description: "Subjects, units, and hours" },
    { label: "Faculty", hint: "g f", href: "/faculty", icon: UserSquare, description: "Teachers and loads" },
    { label: "Rooms", hint: "g r", href: "/rooms", icon: Buildings, description: "Buildings, floors, rooms" },
    { label: "Timetable Analytics", hint: "", href: "/analytics", icon: ChartBar, description: "Utilization and peak hours" },
    ...(admin ? [{ label: "Users & Settings", hint: "", href: "/admin/users", icon: Gear, description: "Accounts and approvals" }] : []),
  ];

  const classesByLevel = (level: string) => activeClasses.filter((c) => c.section.level === level);

  return (
    <div className="space-y-5">
      {header}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {stats.map((s) => (
          <Link
            key={s.label}
            href={s.href}
            className={cn(
              "group relative rounded-xl border bg-card p-4 shadow-xs transition-all hover:-translate-y-0.5 hover:shadow-md",
              s.danger && "border-red-500/40 bg-red-500/[0.04]"
            )}
          >
            <div className="flex items-center gap-3">
              <span className={cn("flex size-10 items-center justify-center rounded-lg", s.danger ? "bg-red-500/15 text-red-600" : "bg-primary/10 text-primary")}>
                <s.icon className="size-5" />
              </span>
              <div className="min-w-0">
                <p className="text-2xl font-semibold tabular-nums leading-tight">{s.value}</p>
                <p className="truncate text-xs text-muted-foreground">{s.label}</p>
              </div>
            </div>
            <div className="absolute top-3 right-3">
              <TrendBadge value={s.trend} invert={s.invert} />
            </div>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-5">
          <section aria-labelledby="qa-title" className="space-y-2">
            <h2 id="qa-title" className="text-sm font-semibold text-muted-foreground">
              Quick actions <span className="font-normal">· arrow keys to move, Enter to open</span>
            </h2>
            <CardGrid label="Quick actions" className="sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4">
              {quickActions.map((a) => (
                <SelectCard
                  key={a.href}
                  href={a.href}
                  icon={a.icon}
                  title={a.label}
                  subtitle={a.description}
                  meta={a.hint ? <Kbd>{a.hint}</Kbd> : undefined}
                />
              ))}
            </CardGrid>
          </section>

          <section aria-labelledby="lv-title" className="space-y-2">
            <h2 id="lv-title" className="text-sm font-semibold text-muted-foreground">
              By academic level (active terms)
            </h2>
            <CardGrid label="Academic levels" className="lg:grid-cols-2 2xl:grid-cols-4">
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
        </div>

        <div className="space-y-4">
          <Card>
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

          {!admin && myTeaching}

          {admin && (
            <Card>
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
                {admin && (
                  <Link href="/admin/audit-logs" className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                    View audit log <ArrowRight className="size-3" />
                  </Link>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
