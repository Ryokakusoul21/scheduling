"use client";

import Link from "next/link";
import { Broadcast, Clock, MapPin } from "@phosphor-icons/react/ssr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard, StatGrid } from "@/components/dashboard/kit";
import { EmptyState } from "@/components/ux/states";
import { formatRange, formatTime } from "@/lib/scheduler/timetable";
import { formatDateRange, greeting, longDate, startsIn } from "@/lib/student/format";
import { nowAndNext } from "@/lib/student/schedule";
import { useNow } from "@/lib/student/use-now";
import type { PortalActivity, PortalClass } from "@/lib/student/portal";
import { cn } from "@/lib/utils";

const Hint = ({ children }: { children: React.ReactNode }) => <p className="text-xs text-muted-foreground">{children}</p>;
const titleCase = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

/** Greeting, summary cards, and the live Today panel of the student dashboard. */
export function StudentOverview({ firstName, term, classes, activities }: { firstName: string; term: string; classes: PortalClass[]; activities: PortalActivity[] }) {
  const at = useNow();
  if (!at) return <OverviewSkeleton />;
  const { now, today, next, dayOff } = nowAndNext(classes, activities, at);

  const subjects = new Map(classes.map((c) => [c.subjectCode, c.units]));
  const units = [...subjects.values()].reduce((sum, u) => sum + u, 0);
  const hours = classes.reduce((sum, c) => sum + (c.endMin - c.startMin), 0) / 60;
  const meeting = today.filter((c) => !c.cancelled);
  const upcoming = activities.filter((a) => a.endDate >= now.date);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {greeting(now.minutes)}, {firstName}
        </h1>
        <p className="text-sm text-muted-foreground">
          {longDate(now.date)} · {term}
        </p>
      </div>

      <StatGrid>
        <StatCard label="Classes today" value={meeting.length}>
          <Hint>{dayOff ? `${dayOff.title}: no classes` : today.length > meeting.length ? `${today.length - meeting.length} cancelled` : meeting.length ? `First at ${formatTime(meeting[0].startMin)}` : "No classes today"}</Hint>
        </StatCard>
        <StatCard label="Total subjects" value={subjects.size}>
          <Hint>{units} units</Hint>
        </StatCard>
        <StatCard label="Class hours this week" value={Number.isInteger(hours) ? hours : hours.toFixed(1)}>
          <Hint>{classes.length} meetings a week</Hint>
        </StatCard>
        <StatCard label="Upcoming activities" value={upcoming.length}>
          <Hint>{upcoming[0] ? `Next: ${upcoming[0].title}, ${formatDateRange(upcoming[0].startDate, upcoming[0].endDate)}` : "Nothing scheduled"}</Hint>
        </StatCard>
      </StatGrid>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle>Today</CardTitle>
            <Link href="/student/schedule" className="rounded-sm text-sm font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
              View full schedule
            </Link>
          </CardHeader>
          <CardContent>
            {today.length === 0 || dayOff ? (
              <EmptyState
                title={dayOff ? `No classes today: ${dayOff.title}` : "No classes today. Enjoy!"}
                description={next ? `Your next class is ${next.cls.subjectCode} on ${titleCase(next.cls.dayOfWeek)}.` : undefined}
                className="py-6"
              />
            ) : (
              <ol className="space-y-2" aria-label="Today's classes">
                {today.map((c) => (
                  <li
                    key={c.id}
                    className={cn(
                      "flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border p-3",
                      c.live && !c.cancelled && "border-primary bg-primary/5",
                      (c.done || c.cancelled) && "opacity-60"
                    )}
                  >
                    <span className="w-36 shrink-0 text-sm font-medium tabular-nums">{formatRange(c.startMin, c.endMin)}</span>
                    <span className="min-w-0 flex-1">
                      <span className={cn("block text-sm font-medium", c.cancelled && "line-through")}>
                        {c.subjectCode} - {c.subjectName}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {c.room ?? "Room to be announced"} · {c.faculty}
                      </span>
                    </span>
                    {c.cancelled ? (
                      <StatusTag tone="muted">Cancelled</StatusTag>
                    ) : c.live ? (
                      <StatusTag tone="live">
                        <Broadcast className="size-3.5" aria-hidden /> Live now
                      </StatusTag>
                    ) : c.done ? (
                      <StatusTag tone="muted">Done</StatusTag>
                    ) : next?.cls.id === c.id && next.inMinutes != null ? (
                      <StatusTag tone="next">Up next</StatusTag>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Next class</CardTitle>
          </CardHeader>
          <CardContent>
            {next ? (
              <div className="space-y-3">
                <div>
                  <p className="text-lg font-semibold">{next.cls.subjectCode}</p>
                  <p className="text-sm">{next.cls.subjectName}</p>
                </div>
                <p className="flex items-center gap-2 text-sm">
                  <Clock className="size-4 text-muted-foreground" aria-hidden />
                  {next.inMinutes != null ? "Today" : longDate(next.date).split(",")[0]}, {formatRange(next.cls.startMin, next.cls.endMin)}
                </p>
                <p className="flex items-center gap-2 text-sm">
                  <MapPin className="size-4 text-muted-foreground" aria-hidden />
                  {next.cls.room ?? "Room to be announced"}
                  {next.cls.building && <span className="text-muted-foreground">· {next.cls.building}</span>}
                </p>
                <p className="text-sm text-muted-foreground">{next.cls.faculty}</p>
                {next.inMinutes != null && <StatusTag tone="next">Starts {startsIn(next.inMinutes)}</StatusTag>}
              </div>
            ) : (
              <EmptyState title="No upcoming classes" description="Nothing is scheduled in the coming week." className="py-6" />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatusTag({ tone, children }: { tone: "live" | "next" | "muted"; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        tone === "live" && "bg-red-600 text-white",
        tone === "next" && "bg-primary/10 text-primary",
        tone === "muted" && "bg-muted text-muted-foreground"
      )}
    >
      {children}
    </span>
  );
}

function OverviewSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading your dashboard">
      <Skeleton className="h-12 w-72" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-24" />)}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-64 lg:col-span-2" />
        <Skeleton className="h-64" />
      </div>
    </div>
  );
}
