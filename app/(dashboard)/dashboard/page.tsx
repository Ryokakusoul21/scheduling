import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { DashboardCalendarCard } from "@/components/scheduler/dashboard-calendar-card";
import type { CalendarEntry } from "@/components/scheduler/weekly-calendar";
import { recordAndGetTrend } from "@/lib/analytics/dailyStat";
import { activeOverlapConflicts } from "@/lib/scheduler/term-conflicts";
import { canManageScheduling, isStaff, type AppRole } from "@/lib/permissions/roles";
import { AssistantChat, AssistantHeader } from "@/components/assistant/assistant-chat";
import { getAssistantHistory } from "../assistant/actions";
import {
  Users,
  UserSquare as UserSquare2,
  BookOpen,
  Buildings as Building2,
  Warning as AlertTriangle,
  Sparkle as Sparkles,
  CheckCircle as CheckCircle2,
  Lightbulb,
  Clock,
  ShieldCheck,
  MagicWand as Wand2,
  DoorOpen,
  Scales as Scale,
  Broadcast as Radio,
  ArrowUp,
  ArrowDown,
  Robot as Bot,
  ArrowRight,
  CalendarBlank,
  ClipboardText,
  Bell,
  Link as LinkIcon,
  MapPin,
} from "@phosphor-icons/react/ssr";

const ACCENT_BORDERS = ["border-blue-500", "border-violet-500", "border-emerald-500", "border-amber-500"];

const CAPABILITIES = [
  {
    label: "Conflict Detection",
    description: "Automatically checks for time, room, and faculty conflicts",
    icon: ShieldCheck,
    tint: "bg-emerald-500/15 text-emerald-600",
  },
  {
    label: "Smart Recommendations",
    description: "Suggests the best schedule based on AI analysis",
    icon: Wand2,
    tint: "bg-violet-500/15 text-violet-600",
  },
  {
    label: "Auto Room Assignment",
    description: "Finds the most suitable room for each class",
    icon: DoorOpen,
    tint: "bg-blue-500/15 text-blue-600",
  },
  {
    label: "Faculty Load Balancing",
    description: "Ensures fair distribution of classes",
    icon: Scale,
    tint: "bg-amber-500/15 text-amber-600",
  },
  {
    label: "Real-time Updates",
    description: "Instant notifications for schedule changes",
    icon: Radio,
    tint: "bg-red-500/15 text-red-600",
  },
];

const WEEK_DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];

function titleCase(value: string) {
  return value
    .split("_")
    .map((w) => w[0] + w.slice(1).toLowerCase())
    .join(" ");
}

function formatTime(min: number) {
  const h = Math.floor(min / 60);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(min % 60).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

export const metadata = { title: "Dashboard · GCST Scheduling" };

async function getStats() {
  const activeSemester = await prisma.semester.findFirst({ where: { isActive: true } });

  const [
    totalSections,
    totalFaculty,
    totalSubjects,
    totalRooms,
    overlapConflicts,
    rooms,
    facultyList,
  ] = await Promise.all([
    prisma.section.count(),
    prisma.faculty.count({ where: { status: "ACTIVE" } }),
    prisma.subject.count(),
    prisma.room.count(),
    activeOverlapConflicts(),
    prisma.room.findMany({
      select: { id: true, capacity: true, schedules: { select: { startMin: true, endMin: true } } },
    }),
    prisma.faculty.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, maxHours: true, schedules: { select: { startMin: true, endMin: true } } },
    }),
  ]);

  const roomUtilization =
    rooms.length === 0
      ? 0
      : Math.round(
          (rooms.reduce((sum, r) => {
            const booked = r.schedules.reduce((s, e) => s + (e.endMin - e.startMin), 0) / 60;
            return sum + Math.min(booked / 40, 1);
          }, 0) /
            rooms.length) *
            100
        );

  const facultyWorkload =
    facultyList.length === 0
      ? 0
      : Math.round(
          (facultyList.reduce((sum, f) => {
            const hours = f.schedules.reduce((s, e) => s + (e.endMin - e.startMin), 0) / 60;
            return sum + Math.min(hours / Math.max(f.maxHours, 1), 1);
          }, 0) /
            facultyList.length) *
            100
        );

  const busiestRoom = rooms
    .map((r) => ({
      id: r.id,
      minutes: r.schedules.reduce((s, e) => s + (e.endMin - e.startMin), 0),
    }))
    .sort((a, b) => b.minutes - a.minutes)[0];

  const openConflicts = overlapConflicts.length;
  const trend = await recordAndGetTrend({ totalSections, totalFaculty, totalSubjects, totalRooms, openConflicts });

  return {
    totalSections,
    totalFaculty,
    totalSubjects,
    totalRooms,
    openConflicts,
    roomUtilization,
    facultyWorkload,
    activeSemester,
    roomsInUse: rooms.filter((r) => r.schedules.length > 0).length,
    busiestRoomId: busiestRoom?.minutes ? busiestRoom.id : null,
    trend,
  };
}

function TrendBadge({ value, invert = false }: { value: number | null | undefined; invert?: boolean }) {
  if (value === null || value === undefined) {
    return <span className="text-[10px] font-medium text-muted-foreground">New</span>;
  }
  if (value === 0) {
    return <span className="text-[10px] font-medium text-muted-foreground">No change</span>;
  }
  const up = value > 0;
  const good = invert ? !up : up;
  return (
    <span className={`flex items-center gap-0.5 text-[10px] font-medium ${good ? "text-emerald-600" : "text-red-600"}`}>
      {up ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
      {Math.abs(value)}%
    </span>
  );
}

export default async function DashboardPage() {
  const user = await requireUser();
  const canSchedule = canManageScheduling(user.role as AppRole);
  const isStudent = user.role === "STUDENT";
  const stats = await getStats();

  const [recentAudit, sectionsWithSchedules, latestSchedule, ownStudent, assistantHistory, myRequests, myNotifications] = await Promise.all([
    // Students don't see the activity feed (it's the system audit log).
    isStudent
      ? Promise.resolve([])
      : prisma.auditLog.findMany({
          take: 5,
          orderBy: { createdAt: "desc" },
          include: { user: { select: { name: true } } },
        }),
    prisma.section.findMany({
      where: { semesterId: stats.activeSemester?.id, schedules: { some: {} } },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        schedules: {
          include: { subject: true, faculty: true, room: true },
          orderBy: { startMin: "asc" },
        },
      },
    }),
    prisma.schedule.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    Promise.resolve<{ sectionId: string | null } | null>(null),
    getAssistantHistory(),
    isStudent
      ? prisma.scheduleRequest.findMany({
          where: { requestedById: user.id },
          take: 4,
          orderBy: { createdAt: "desc" },
          select: { id: true, type: true, status: true, createdAt: true },
        })
      : Promise.resolve([]),
    isStudent
      ? prisma.notification.findMany({
          where: { userId: user.id },
          take: 4,
          orderBy: { createdAt: "desc" },
          select: { id: true, title: true, message: true, isRead: true, createdAt: true, link: true },
        })
      : Promise.resolve([]),
  ]);

  const subjectColorIndex = new Map<string, number>();
  let nextColor = 0;
  function colorFor(subjectId: string) {
    if (!subjectColorIndex.has(subjectId)) subjectColorIndex.set(subjectId, nextColor++);
    return subjectColorIndex.get(subjectId)!;
  }

  const entriesBySection: Record<string, CalendarEntry[]> = {};
  for (const section of sectionsWithSchedules) {
    entriesBySection[section.id] = section.schedules.map((s) => ({
      id: s.id,
      dayOfWeek: s.dayOfWeek,
      startMin: s.startMin,
      endMin: s.endMin,
      subjectName: s.subject.name,
      subjectCode: s.subject.code,
      facultyName: s.faculty.fullName,
      roomName: s.room.roomName,
      colorIndex: colorFor(s.subjectId),
    }));
  }

  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const todayName = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"][now.getDay()];
  // Students only care about their own section; staff see every section.
  const mySection = isStudent ? sectionsWithSchedules.find((s) => s.id === ownStudent?.sectionId) : undefined;
  const upcomingToday = (isStudent ? (mySection ? [mySection] : []) : sectionsWithSchedules)
    .flatMap((sec) => sec.schedules.map((s) => ({ ...s, sectionName: sec.name })))
    .filter((s) => s.dayOfWeek === todayName && s.endMin >= nowMin)
    .sort((a, b) => a.startMin - b.startMin)
    .slice(0, 4);

  const mySubjects = [
    ...(mySection?.schedules ?? [])
      .reduce((map, s) => {
        const entry = map.get(s.subjectId) ?? {
          code: s.subject.code,
          name: s.subject.name,
          units: s.subject.units,
          instructors: new Set<string>(),
          minutes: 0,
        };
        entry.instructors.add(s.faculty.fullName);
        entry.minutes += s.endMin - s.startMin;
        return map.set(s.subjectId, entry);
      }, new Map<string, { code: string; name: string; units: number; instructors: Set<string>; minutes: number }>())
      .values(),
  ].sort((a, b) => a.code.localeCompare(b.code));
  const totalUnits = mySubjects.reduce((sum, s) => sum + s.units, 0);
  const totalWeeklyHours = Math.round((mySubjects.reduce((sum, s) => sum + s.minutes, 0) / 60) * 10) / 10;
  const myWeek = WEEK_DAYS.map((day) => {
    const classes = (mySection?.schedules ?? []).filter((s) => s.dayOfWeek === day);
    const minutes = classes.reduce((sum, s) => sum + (s.endMin - s.startMin), 0);
    const first = classes.reduce((min, s) => Math.min(min, s.startMin), Infinity);
    const last = classes.reduce((max, s) => Math.max(max, s.endMin), 0);
    return { day, count: classes.length, minutes, first, last };
  });
  const busiestDayMinutes = Math.max(...myWeek.map((d) => d.minutes), 1);

  // Next class from now, wrapping around to next week if needed.
  const todayIndex = now.getDay() === 0 ? 6 : now.getDay() - 1; // Monday = 0
  const nextClass = (mySection?.schedules ?? [])
    .filter((s) => WEEK_DAYS.includes(s.dayOfWeek))
    .map((s) => {
      let daysAhead = (WEEK_DAYS.indexOf(s.dayOfWeek) - todayIndex + 7) % 7;
      if (daysAhead === 0 && s.startMin <= nowMin) daysAhead = 7;
      return { ...s, daysAhead, sortKey: daysAhead * 1440 + s.startMin };
    })
    .sort((a, b) => a.sortKey - b.sortKey)[0];

  const cards = [
    { label: "Sections", value: stats.totalSections, icon: Users, tint: "bg-blue-500/15 text-blue-600", trend: stats.trend.totalSections },
    { label: "Faculty", value: stats.totalFaculty, icon: UserSquare2, tint: "bg-violet-500/15 text-violet-600", trend: stats.trend.totalFaculty },
    { label: "Subjects", value: stats.totalSubjects, icon: BookOpen, tint: "bg-emerald-500/15 text-emerald-600", trend: stats.trend.totalSubjects },
    { label: "Rooms", value: stats.totalRooms, icon: Building2, tint: "bg-amber-500/15 text-amber-600", trend: stats.trend.totalRooms },
    {
      label: "Schedule Conflicts",
      value: stats.openConflicts,
      icon: AlertTriangle,
      tint: stats.openConflicts > 0 ? "bg-red-500/15 text-red-600" : "bg-emerald-500/15 text-emerald-600",
      trend: stats.trend.openConflicts,
      invert: true,
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome back, {user.name?.split(" ")[0] ?? "there"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {stats.activeSemester
            ? `${stats.activeSemester.name} · Granby Colleges of Science & Technology, Naic, Cavite`
            : "No active semester configured yet."}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {cards.map((c) => (
          <Card key={c.label} className="relative">
            <CardContent className="flex items-center gap-3 p-4">
              <div className={`flex size-11 shrink-0 items-center justify-center rounded-full ${c.tint}`}>
                <c.icon className="size-5" />
              </div>
              <div className="min-w-0">
                <p className="text-2xl font-semibold tabular-nums leading-tight">{c.value}</p>
                <p className="truncate text-xs text-muted-foreground">{c.label}</p>
              </div>
              <div className="absolute right-3 top-3">
                <TrendBadge value={c.trend} invert={c.invert} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {canSchedule && (
      <Card>
        <CardContent className="flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-violet-500 text-primary-foreground">
              <Sparkles className="size-5" />
            </div>
            <div>
              <p className="font-semibold">AI Schedule Generator</p>
              <p className="max-w-md text-sm text-muted-foreground">
                Let our AI create the best possible schedule based on your constraints and requirements.
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                {["Balanced Workload", "No Conflicts", "Room Optimization", "Preferred Time Slots"].map((label) => (
                  <label key={label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Checkbox checked disabled />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div className="flex flex-col items-start gap-1 md:items-end">
            <a
              href="/schedules"
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Sparkles className="size-4" /> Open Scheduler <ArrowRight className="size-4" />
            </a>
            <p className="text-xs text-muted-foreground">
              {latestSchedule ? `Last generated: ${latestSchedule.createdAt.toLocaleString()}` : "No schedule generated yet"}
            </p>
          </div>
        </CardContent>
      </Card>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(380px,32%)] 2xl:grid-cols-[minmax(0,1fr)_minmax(440px,36%)]">
        <div className="space-y-4">
          <DashboardCalendarCard
            sections={sectionsWithSchedules.map((s) => ({ id: s.id, name: s.name }))}
            entriesBySection={entriesBySection}
            defaultSectionId={ownStudent?.sectionId ?? undefined}
          />

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {CAPABILITIES.map((c) => (
              <Card key={c.label}>
                <CardContent className="flex flex-col items-center gap-2 p-4 text-center">
                  <div className={`flex size-10 items-center justify-center rounded-full ${c.tint}`}>
                    <c.icon className="size-5" />
                  </div>
                  <p className="text-xs font-semibold">{c.label}</p>
                  <p className="text-[11px] leading-snug text-muted-foreground">{c.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {mySection && (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <BookOpen className="size-4 text-primary" /> My Subjects This Semester
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: "Subjects", value: mySubjects.length },
                      { label: "Total units", value: totalUnits },
                      { label: "Hours / week", value: totalWeeklyHours },
                    ].map((s) => (
                      <div key={s.label} className="rounded-lg bg-muted/60 px-3 py-2">
                        <p className="text-lg font-semibold tabular-nums leading-tight">{s.value}</p>
                        <p className="text-[11px] text-muted-foreground">{s.label}</p>
                      </div>
                    ))}
                  </div>
                  <div className="divide-y text-sm">
                    {mySubjects.map((s) => (
                      <div key={s.code} className="flex items-start justify-between gap-3 py-2 first:pt-0 last:pb-0">
                        <div className="min-w-0">
                          <p className="truncate font-medium">
                            <span className="text-primary">{s.code}</span> · {s.name}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">{[...s.instructors].join(", ")}</p>
                        </div>
                        <div className="shrink-0 text-right text-xs text-muted-foreground">
                          <p className="font-medium text-foreground">{s.units} unit{s.units === 1 ? "" : "s"}</p>
                          <p>{Math.round((s.minutes / 60) * 10) / 10} hrs/wk</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <CalendarBlank className="size-4 text-primary" /> My Week at a Glance
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col gap-2.5">
                  {myWeek.map((d) => (
                    <div
                      key={d.day}
                      className={`rounded-lg px-3 py-2 ${d.day === todayName ? "bg-primary/10 ring-1 ring-primary/30" : ""}`}
                    >
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium">
                          {d.day[0] + d.day.slice(1, 3).toLowerCase()}
                          {d.day === todayName && <span className="ml-1.5 text-[10px] font-semibold text-primary">TODAY</span>}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {d.count === 0
                            ? "No classes"
                            : `${d.count} class${d.count === 1 ? "" : "es"} · ${formatTime(d.first)}–${formatTime(d.last)}`}
                        </span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${(d.minutes / busiestDayMinutes) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                  {nextClass && (
                    <div className="mt-auto rounded-xl bg-gradient-to-br from-primary to-violet-500 p-4 text-primary-foreground">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-primary-foreground/80">
                        Next class ·{" "}
                        {nextClass.daysAhead === 0
                          ? "Today"
                          : nextClass.daysAhead === 1
                            ? "Tomorrow"
                            : nextClass.dayOfWeek[0] + nextClass.dayOfWeek.slice(1).toLowerCase()}
                      </p>
                      <p className="mt-1 font-semibold leading-snug">
                        {nextClass.subject.code} · {nextClass.subject.name}
                      </p>
                      <div className="mt-2 space-y-0.5 text-xs text-primary-foreground/90">
                        <p className="flex items-center gap-1.5">
                          <Clock className="size-3.5" /> {formatTime(nextClass.startMin)}–{formatTime(nextClass.endMin)}
                        </p>
                        <p className="flex items-center gap-1.5">
                          <MapPin className="size-3.5" /> {nextClass.room.roomName}
                        </p>
                        <p className="flex items-center gap-1.5">
                          <UserSquare2 className="size-3.5" /> {nextClass.faculty.fullName}
                        </p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <Card className="gap-0 py-0">
            <div className="border-b p-4">
              <AssistantHeader />
            </div>
            <AssistantChat
              initialMessages={assistantHistory}
              userName={user.name}
              staff={isStaff(user.role as AppRole)}
              className="h-[min(40rem,75dvh)]"
            />
          </Card>

          {canSchedule && (
          <Card className="border-primary/20 bg-gradient-to-br from-primary to-primary/90 text-primary-foreground">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-primary-foreground">
                <Sparkles className="size-5 text-gold" /> GCST AI Scheduler
                <Badge className="ml-auto border-none bg-emerald-500/20 text-emerald-300">● Online</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-primary-foreground/80">
                Hello, {user.name?.split(" ")[0]}! I&apos;ve analyzed the current scheduling
                requirements for {stats.activeSemester?.name ?? "the active term"}.
              </p>
              <ul className="space-y-1.5 text-sm">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-gold" />
                  {stats.openConflicts === 0
                    ? "No open scheduling conflicts"
                    : `${stats.openConflicts} open conflict${stats.openConflicts === 1 ? "" : "s"} need attention`}
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-gold" />
                  Faculty workload balance at {stats.facultyWorkload}%
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-gold" />
                  Room utilization at {stats.roomUtilization}%
                </li>
              </ul>
              <a
                href="/schedules"
                className="inline-block rounded-md bg-gold px-3 py-1.5 text-sm font-medium text-gold-foreground hover:opacity-90"
              >
                Open Scheduler
              </a>
            </CardContent>
          </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Lightbulb className="size-4 text-amber-500" /> Schedule Insights
              </CardTitle>
            </CardHeader>
            <CardContent className="divide-y text-sm">
              <div className="flex items-start gap-2 py-2 first:pt-0 last:pb-0">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                <span>Room utilization is at {stats.roomUtilization}% across {stats.totalRooms} rooms.</span>
              </div>
              <div className="flex items-start gap-2 py-2 first:pt-0 last:pb-0">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                <span>{stats.roomsInUse} of {stats.totalRooms} rooms currently have classes scheduled.</span>
              </div>
              <div className="flex items-start gap-2 py-2 first:pt-0 last:pb-0">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                <span>Faculty workload balance is at {stats.facultyWorkload}% of capacity.</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock className="size-4 text-primary" /> Upcoming Today
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {upcomingToday.length === 0 && (
                <p className="text-sm text-muted-foreground">No more classes scheduled for today.</p>
              )}
              {upcomingToday.map((s, i) => (
                <div
                  key={s.id}
                  className={`border-l-2 py-1 pl-3 text-sm ${ACCENT_BORDERS[i % ACCENT_BORDERS.length]}`}
                >
                  <p className="font-medium">{s.subject.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {s.sectionName} · {s.room.roomName} · {formatTime(s.startMin)}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>

          {isStudent && (
            <>
              <Card>
                <CardHeader className="flex-row items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <ClipboardText className="size-4 text-primary" /> My Schedule Requests
                  </CardTitle>
                  <a href="/requests" className="text-xs font-medium text-primary hover:underline">
                    View all
                  </a>
                </CardHeader>
                <CardContent className="space-y-2">
                  {myRequests.length === 0 ? (
                    <div className="space-y-2">
                      <p className="text-sm text-muted-foreground">You haven&apos;t submitted any requests.</p>
                      <a
                        href="/requests"
                        className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                      >
                        Request a schedule change <ArrowRight className="size-3.5" />
                      </a>
                    </div>
                  ) : (
                    myRequests.map((r) => (
                      <div key={r.id} className="flex items-center justify-between gap-2 text-sm">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{titleCase(r.type)}</p>
                          <p className="text-xs text-muted-foreground">{r.createdAt.toLocaleDateString()}</p>
                        </div>
                        <Badge
                          variant={
                            r.status === "REJECTED"
                              ? "destructive"
                              : r.status === "APPROVED" || r.status === "COMPLETED"
                                ? "default"
                                : "secondary"
                          }
                        >
                          {titleCase(r.status)}
                        </Badge>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex-row items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Bell className="size-4 text-primary" /> Notifications
                  </CardTitle>
                  <a href="/notifications" className="text-xs font-medium text-primary hover:underline">
                    View all
                  </a>
                </CardHeader>
                <CardContent className="space-y-3">
                  {myNotifications.length === 0 && (
                    <p className="text-sm text-muted-foreground">You&apos;re all caught up.</p>
                  )}
                  {myNotifications.map((n) => (
                    <a key={n.id} href={n.link || "/notifications"} className="flex gap-2 text-sm hover:opacity-80">
                      <span
                        className={`mt-1.5 size-2 shrink-0 rounded-full ${n.isRead ? "bg-muted-foreground/30" : "bg-primary"}`}
                      />
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{n.title}</span>
                        <span className="line-clamp-2 text-xs text-muted-foreground">{n.message}</span>
                      </span>
                    </a>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <LinkIcon className="size-4 text-primary" /> Quick Links
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-2">
                  {[
                    { label: "Schedule Calendar", href: "/calendar", icon: CalendarBlank },
                    { label: "Schedule Requests", href: "/requests", icon: ClipboardText },
                    { label: "AI Assistant", href: "/assistant", icon: Bot },
                    { label: "Notifications", href: "/notifications", icon: Bell },
                  ].map((l) => (
                    <a
                      key={l.href}
                      href={l.href}
                      className="flex flex-col items-start gap-2 rounded-lg border p-3 text-sm font-medium transition-colors hover:bg-muted"
                    >
                      <l.icon className="size-5 text-primary" />
                      {l.label}
                    </a>
                  ))}
                </CardContent>
              </Card>
            </>
          )}

          {!isStudent && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent Activity</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {recentAudit.length === 0 && (
                <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
              )}
              {recentAudit.map((log) => (
                <div key={log.id} className="text-sm">
                  <p className="font-medium">{log.action}</p>
                  <p className="text-xs text-muted-foreground">
                    {log.user?.name ?? "System"} · {new Date(log.createdAt).toLocaleString()}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
          )}

          {!isStudent && (
          <Card className="border-none bg-[oklch(0.18_0.05_264)] text-white">
            <CardContent className="space-y-3 p-4">
              <div className="flex size-9 items-center justify-center rounded-full bg-white/10">
                <Bot className="size-5" />
              </div>
              <p className="text-sm text-white/80">
                Let AI handle the complexity, so you can focus on what matters most — quality education.
              </p>
              <a
                href={canSchedule ? "/schedules" : "/assistant"}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                {canSchedule ? "Try AI Scheduler" : "Open AI Assistant"} <ArrowRight className="size-4" />
              </a>
            </CardContent>
          </Card>
          )}
        </div>
      </div>
    </div>
  );
}
