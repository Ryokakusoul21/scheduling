import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { DashboardCalendarCard } from "@/components/scheduler/dashboard-calendar-card";
import type { CalendarEntry } from "@/components/scheduler/weekly-calendar";
import { recordAndGetTrend } from "@/lib/analytics/dailyStat";
import {
  Users,
  UserSquare2,
  BookOpen,
  Building2,
  AlertTriangle,
  Sparkles,
  CheckCircle2,
  Lightbulb,
  Clock,
  ShieldCheck,
  Wand2,
  DoorOpen,
  Scale,
  Radio,
  ArrowUp,
  ArrowDown,
  Bot,
  ArrowRight,
} from "lucide-react";

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

export const metadata = { title: "Dashboard · GCST Scheduling" };

async function getStats() {
  const activeSemester = await prisma.semester.findFirst({ where: { isActive: true } });

  const [
    totalStudents,
    totalFaculty,
    totalSubjects,
    totalRooms,
    openConflicts,
    rooms,
    facultyList,
  ] = await Promise.all([
    prisma.student.count({ where: { status: "ACTIVE" } }),
    prisma.faculty.count({ where: { status: "ACTIVE" } }),
    prisma.subject.count(),
    prisma.room.count(),
    prisma.conflict.count({ where: { status: "OPEN" } }),
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

  const trend = await recordAndGetTrend({ totalStudents, totalFaculty, totalSubjects, totalRooms, openConflicts });

  return {
    totalStudents,
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
  const stats = await getStats();

  const [recentAudit, sectionsWithSchedules, latestSchedule] = await Promise.all([
    prisma.auditLog.findMany({
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
  const upcomingToday = sectionsWithSchedules
    .flatMap((sec) => sec.schedules.map((s) => ({ ...s, sectionName: sec.name })))
    .filter((s) => s.dayOfWeek === todayName && s.endMin >= nowMin)
    .sort((a, b) => a.startMin - b.startMin)
    .slice(0, 4);

  const cards = [
    { label: "Total Students", value: stats.totalStudents, icon: Users, tint: "bg-blue-500/15 text-blue-600", trend: stats.trend.totalStudents },
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
              href="/ai-scheduler"
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Sparkles className="size-4" /> Generate Schedule <ArrowRight className="size-4" />
            </a>
            <p className="text-xs text-muted-foreground">
              {latestSchedule ? `Last generated: ${latestSchedule.createdAt.toLocaleString()}` : "No schedule generated yet"}
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <DashboardCalendarCard
            sections={sectionsWithSchedules.map((s) => ({ id: s.id, name: s.name }))}
            entriesBySection={entriesBySection}
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
        </div>

        <div className="space-y-4">
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
                href="/ai-scheduler"
                className="inline-block rounded-md bg-gold px-3 py-1.5 text-sm font-medium text-gold-foreground hover:opacity-90"
              >
                View AI Auto Scheduler
              </a>
            </CardContent>
          </Card>

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
                    {s.sectionName} · {s.room.roomName} · {String(Math.floor(s.startMin / 60)).padStart(2, "0")}:
                    {String(s.startMin % 60).padStart(2, "0")}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>

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

          <Card className="border-none bg-[oklch(0.18_0.05_264)] text-white">
            <CardContent className="space-y-3 p-4">
              <div className="flex size-9 items-center justify-center rounded-full bg-white/10">
                <Bot className="size-5" />
              </div>
              <p className="text-sm text-white/80">
                Let AI handle the complexity, so you can focus on what matters most — quality education.
              </p>
              <a
                href="/ai-scheduler"
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Try AI Scheduler <ArrowRight className="size-4" />
              </a>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
