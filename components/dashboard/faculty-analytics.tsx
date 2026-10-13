"use client";

import Link from "next/link";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { UserMinus } from "@phosphor-icons/react/ssr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Heatmap, TOOLTIP_STYLE } from "@/components/charts/utilization";
import { LoadBar, LoadStatusLabel } from "@/components/workload/load-bar";
import type { FacultyAnalytics } from "@/lib/analytics/faculty";
import { HEATMAP_DAYS, HEATMAP_HOURS } from "@/lib/analytics/timetable";
import { DAY_LONG, formatRange, formatTime } from "@/lib/scheduler/timetable";
import { DashboardToolbar, StatCard, StatGrid, type ReportBlock } from "./kit";
import { HoursBars, UpcomingList } from "./charts";
import { WeekGrid } from "./week-grid";

type Option = { value: string; label: string };

function blocks(d: FacultyAnalytics): ReportBlock[] {
  return [
    {
      title: `My Teaching Analytics: ${d.name}, ${d.term.label}`,
      header: ["Measure", "Value"],
      rows: [
        ["Teaching load", `${d.load.value} ${d.load.unit} (allowed ${d.load.minimum} to ${d.load.maximum})`],
        ["Teaching hours per week", d.load.hours],
        ["Teaching units", d.load.units],
        ["Subjects", d.counts.subjects],
        ["Sections", d.counts.sections],
        ["Students", d.counts.students],
        ["Faculty Utilization Rate (percent)", d.utilization],
        ["Classes today", d.today.length],
        ["Classes in the next seven days", d.weekCount],
        ["Upcoming room bookings", d.bookings.length],
        ["Changes made to my classes", d.changes.count],
      ],
    },
    { title: "Weekly teaching hours by day", header: ["Day", "Hours"], rows: d.byDay.map((r) => [r.day, r.hours]) },
    { title: "My timetable", header: ["Day", "Time", "Class", "Room and type"], rows: d.timetable.map((t) => [DAY_LONG[t.dayOfWeek], formatRange(t.startMin, t.endMin), t.title, t.detail]) },
    { title: "My load compared with the department", header: ["Measure", d.load.unit], rows: d.comparison.map((c) => [c.name, c.value]) },
    { title: "My busy hours (class meetings in session)", header: ["Day", ...HEATMAP_HOURS.map((h) => formatTime(h * 60))], rows: d.heatmap.map((row, i) => [DAY_LONG[HEATMAP_DAYS[i]], ...row]) },
    { title: "Rooms I use most", header: ["Room", "Hours per week"], rows: d.rooms.map((r) => [r.name, r.hours]) },
    { title: "Notifications", header: ["Type", "Title", "What changed and why", "When"], rows: d.notifications.map((n) => [n.kind, n.title, n.message, new Date(n.at).toLocaleString("en-PH")]) },
    { title: "Upcoming examinations and activities", header: ["Date", "Type", "Title", "Details"], rows: d.upcoming.map((u) => [u.date, u.kind, u.title, u.detail]) },
  ];
}

const COMPARISON_FILL = ["var(--chart-1)", "var(--chart-3)", "#d97706", "#dc2626"];

export function FacultyAnalyticsView({ data, terms, title = "My teaching analytics", toggle }: { data: FacultyAnalytics; terms: Option[]; title?: string; toggle?: React.ReactNode }) {
  const d = data;
  return (
    <section aria-label={title} className="print-area space-y-4">
      <DashboardToolbar
        title={title}
        printTitle={`My Teaching Analytics: ${d.name}`}
        printSubtitle={`${d.term.label} · ${d.department}`}
        filename="my-teaching-analytics"
        blocks={blocks(d)}
        filters={[{ key: "term", label: "Semester", value: d.term.id, options: terms }]}
      >
        {toggle}
      </DashboardToolbar>

      <StatGrid>
        <StatCard label="My teaching load" value={`${d.load.value} ${d.load.unit}`} hint={`${d.load.hours} hours and ${d.load.units} units this term`} change={d.hoursChange} previous={d.previousLabel}>
          <LoadBar r={{ load: d.load.value, minimum: d.load.minimum, maximum: d.load.maximum, status: d.load.status }} className="mt-2" />
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>Allowed {d.load.minimum} to {d.load.maximum}</span>
            <LoadStatusLabel status={d.load.status} />
          </div>
        </StatCard>
        <StatCard label="Subjects, sections, and students" value={`${d.counts.subjects} · ${d.counts.sections} · ${d.counts.students}`} hint="Subjects · sections · students taught" />
        <StatCard label="My Faculty Utilization Rate" value={`${d.utilization}%`} hint={`${d.load.hours} of ${d.maxHours} maximum teaching hours`} />
        <StatCard label="Upcoming classes" value={`${d.today.length} today · ${d.weekCount} this week`} hint="Next seven days, after any rescheduling" />
        <StatCard label="My room bookings" value={String(d.bookings.length)} hint={d.bookings[0] ? `Next: ${d.bookings[0].room}, ${d.bookings[0].date}` : "No upcoming bookings"} />
        <StatCard label="Changes to my classes" value={String(d.changes.count)} hint="Rescheduled, substituted, cancelled, or reassigned" />
      </StatGrid>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Today</CardTitle></CardHeader>
          <CardContent>
            {d.today.length === 0 ? <p className="text-sm text-muted-foreground">No classes today.</p> : (
              <ul className="space-y-2">
                {d.today.map((c, i) => (
                  <li key={i} className="flex items-center gap-3 rounded-lg border p-2.5 text-sm">
                    <span className="w-32 shrink-0 text-xs font-medium text-muted-foreground">{c.time}</span>
                    <span className="min-w-0 flex-1 truncate font-medium">{c.label}</span>
                    <span className="text-xs text-muted-foreground">{c.room}</span>
                    {c.changed && <Badge variant="secondary">Rescheduled</Badge>}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">Changes made to my classes</CardTitle>
            <Button size="sm" variant="outline" nativeButton={false} render={<Link href="/availability" />}>
              <UserMinus className="size-4" /> Report unavailability
            </Button>
          </CardHeader>
          <CardContent>
            {d.changes.recent.length === 0 ? <p className="text-sm text-muted-foreground">No changes this term.</p> : (
              <ul className="space-y-2">
                {d.changes.recent.map((c) => (
                  <li key={c.id} className="rounded-lg border p-2.5 text-sm">
                    <p className="flex flex-wrap items-center gap-2 font-medium">{c.label} <Badge variant="outline">{c.kind}</Badge> <span className="text-xs font-normal text-muted-foreground">{c.date}</span></p>
                    <p className="text-xs text-muted-foreground">{c.reason}</p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">My weekly teaching hours by day</CardTitle></CardHeader>
          <CardContent className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={d.byDay} margin={{ top: 20 }}>
                <CartesianGrid vertical={false} stroke="currentColor" opacity={0.08} />
                <XAxis dataKey="day" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "currentColor", opacity: 0.05 }} formatter={(v) => [`${v} hours`, "Teaching"]} />
                <Bar dataKey="hours" fill="var(--chart-1)" radius={[4, 4, 0, 0]} barSize={36}>
                  <LabelList dataKey="hours" position="top" fontSize={11} fill="currentColor" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">My load compared with the department</CardTitle></CardHeader>
          <CardContent className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={d.comparison} layout="vertical" margin={{ left: 8, right: 32 }}>
                <CartesianGrid horizontal={false} stroke="currentColor" opacity={0.08} />
                <XAxis type="number" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="name" width={130} fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "currentColor", opacity: 0.05 }} formatter={(v) => [`${v} ${d.load.unit}`, ""]} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={16}>
                  {d.comparison.map((c, i) => <Cell key={c.name} fill={COMPARISON_FILL[i]} />)}
                  <LabelList dataKey="value" position="right" fontSize={11} fill="currentColor" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">My timetable</CardTitle></CardHeader>
        <CardContent>{d.timetable.length ? <WeekGrid entries={d.timetable} /> : <p className="text-sm text-muted-foreground">No classes this term.</p>}</CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-1">
          <Heatmap grid={d.heatmap} />
          <p className="px-1 text-xs text-muted-foreground">Darker cells are my busiest hours; empty cells are free hours.</p>
        </div>
        <HoursBars title="Rooms I use most" rows={d.rooms} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Notifications</CardTitle></CardHeader>
          <CardContent>
            {d.notifications.length === 0 ? <p className="text-sm text-muted-foreground">No workload, rescheduling, suspension, or unavailability updates.</p> : (
              <ul className="max-h-96 space-y-2 overflow-y-auto">
                {d.notifications.map((n) => (
                  <li key={n.id} className="rounded-lg border p-2.5 text-sm">
                    <p className="flex flex-wrap items-center gap-2"><Badge variant="secondary">{n.kind}</Badge><span className="font-medium">{n.title}</span>{!n.isRead && <Badge>New</Badge>}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{n.message}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">{new Date(n.at).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })}</p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <UpcomingList items={d.upcoming} title="My upcoming examinations and activities" />
      </div>
    </section>
  );
}
