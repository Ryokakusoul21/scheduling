"use client";

import { useState } from "react";
import Link from "next/link";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { UserMinus } from "@phosphor-icons/react/ssr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Heatmap, TOOLTIP_STYLE, CHART_SIZE } from "@/components/charts/utilization";
import { LoadStatusLabel } from "@/components/workload/load-bar";
import type { FacultyAnalytics } from "@/lib/analytics/faculty";
import { HEATMAP_DAYS, HEATMAP_HOURS } from "@/lib/analytics/timetable";
import { DAY_LONG, formatRange, formatTime } from "@/lib/scheduler/timetable";
import { cn } from "@/lib/utils";
import { ChangeBadge, DashboardToolbar, type ReportBlock } from "./kit";
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

/** Circular gauge of the teaching load against the maximum allowed. */
function Ring({ pct, value, unit }: { pct: number; value: number; unit: string }) {
  const r = 40, c = 2 * Math.PI * r;
  return (
    <div className="relative size-28 shrink-0" role="img" aria-label={`${value} ${unit}, ${Math.round(pct)} percent of the maximum`}>
      <svg viewBox="0 0 100 100" className="size-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" strokeWidth="10" className="stroke-muted" />
        <circle cx="50" cy="50" r={r} fill="none" strokeWidth="10" strokeLinecap="round" className={pct > 100 ? "stroke-red-600" : "stroke-primary"} strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(pct, 100) / 100)} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center"><span className="text-2xl font-semibold tabular-nums">{value}</span><span className="text-[11px] text-muted-foreground">{unit}</span></div>
    </div>
  );
}

/** Compact figure tile for the secondary measures beside the headline load card. */
function Tile({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="min-w-0 rounded-2xl border bg-card p-4 shadow-xs transition-shadow hover:shadow-sm">
      <dt className="truncate text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{value}</dd>
      {hint && <p className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

const INSIGHTS = [["timetable", "Timetable"], ["hours", "Hours by day"], ["busy", "Busy hours"], ["rooms", "Rooms"], ["compare", "Compared with department"]] as const;

const COMPARISON_FILL = ["var(--chart-1)", "var(--chart-3)", "#d97706", "#dc2626"];

export function FacultyAnalyticsView({ data, terms, title = "My teaching analytics", toggle }: { data: FacultyAnalytics; terms: Option[]; title?: string; toggle?: React.ReactNode }) {
  const d = data;
  const [tab, setTab] = useState<(typeof INSIGHTS)[number][0]>("timetable");
  return (
    <section aria-label={title} className="print-area space-y-5">
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

      <div className="grid gap-4 xl:grid-cols-[minmax(285px,0.9fr)_minmax(0,1.7fr)]">
        <Card className="border-primary/20 bg-gradient-to-br from-primary/[0.07] via-card to-card shadow-sm">
          <CardContent className="flex h-full items-center gap-5 py-5">
            <Ring pct={d.load.maximum ? (d.load.value / d.load.maximum) * 100 : 0} value={d.load.value} unit={d.load.unit} />
            <div className="min-w-0 space-y-2">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">My teaching load</p>
                <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">{d.load.hours}<span className="ml-1.5 text-base font-medium text-muted-foreground">hours</span></p>
              </div>
              <p className="text-sm text-muted-foreground">{d.load.units} units this term <span aria-hidden>·</span> allowed {d.load.minimum}–{d.load.maximum}</p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                <LoadStatusLabel status={d.load.status} />
                <ChangeBadge change={d.hoursChange} previous={d.previousLabel} />
              </div>
            </div>
          </CardContent>
        </Card>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Tile label="Subjects" value={d.counts.subjects} hint={`${d.counts.sections} sections`} />
          <Tile label="Students taught" value={d.counts.students} />
          <Tile label="Faculty Utilization Rate" value={`${d.utilization}%`} hint={`${d.load.hours} of ${d.maxHours} hours`} />
          <Tile label="Classes today" value={d.today.length} hint={`${d.weekCount} in the next seven days`} />
          <Tile label="Room bookings" value={d.bookings.length} hint={d.bookings[0] ? `Next: ${d.bookings[0].room}, ${d.bookings[0].date}` : "None upcoming"} />
          <Tile label="Changes to my classes" value={d.changes.count} hint="Moved, substituted, or cancelled" />
        </dl>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.25fr)]">
        <Card className="h-full">
          <CardHeader className="border-b pb-3"><CardTitle className="text-base">Today</CardTitle><p className="text-xs text-muted-foreground">Your classes for the day</p></CardHeader>
          <CardContent className="pt-1">
            {d.today.length === 0 ? <p className="text-sm text-muted-foreground">No classes today.</p> : (
              <ul className="max-h-80 space-y-1 overflow-y-auto">
                {d.today.map((c, i) => (
                  <li key={i} className="flex items-start gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-muted/50">
                    <span className="mt-0.5 min-w-16 shrink-0 rounded-md bg-primary/10 px-2 py-1 text-center text-[11px] font-semibold tabular-nums text-primary">{c.time.split("–")[0].trim()}</span>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-sm font-medium leading-snug">{c.label}</p>
                      <p className="mt-1 truncate text-xs text-muted-foreground">{c.time} · {c.room}</p>
                    </div>
                    {c.changed && <Badge variant="secondary">Rescheduled</Badge>}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card className="h-full">
          <CardHeader className="border-b pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base">Changes to my classes</CardTitle>
              <Button size="sm" variant="outline" nativeButton={false} render={<Link href="/availability" />}>
                <UserMinus className="size-4" /> Report unavailability
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Recent moves, substitutions, and cancellations</p>
          </CardHeader>
          <CardContent className="pt-1">
            {d.changes.recent.length === 0 ? <p className="text-sm text-muted-foreground">No changes this term.</p> : (
              <ul className="max-h-80 space-y-2 overflow-y-auto">
                {d.changes.recent.map((c) => (
                  <li key={c.id} className="rounded-xl border bg-muted/20 p-3 text-sm">
                    <p className="flex flex-wrap items-center gap-2 font-medium">{c.label} <Badge variant="outline">{c.kind}</Badge> <span className="text-xs font-normal text-muted-foreground">{c.date}</span></p>
                    <p className="text-xs text-muted-foreground">{c.reason}</p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <div className="min-w-0 [&_[data-slot=card]]:h-full [&_[data-slot=card-header]]:border-b [&_[data-slot=card-header]]:pb-3">
          <UpcomingList items={d.upcoming} title="Upcoming examinations and activities" />
        </div>
      </div>

      <Card>
        <CardHeader className="gap-4 border-b pb-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <CardTitle className="text-lg">Teaching insights</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">Explore your weekly schedule, workload, and room use.</p>
            </div>
            <div role="tablist" aria-label="Teaching insights" className="flex max-w-full gap-1 overflow-x-auto rounded-xl border bg-muted/40 p-1 print:hidden">
              {INSIGHTS.map(([id, label]) => (
                <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className="shrink-0 rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring aria-selected:bg-card aria-selected:text-foreground aria-selected:shadow-sm sm:text-sm">{label}</button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-1">
          <div role="tabpanel" className={cn(tab !== "timetable" && "hidden print:block")}>
            <h3 className="mb-3 text-base font-semibold">My timetable</h3>
            {d.timetable.length ? <WeekGrid entries={d.timetable} /> : <p className="text-sm text-muted-foreground">No classes this term.</p>}
          </div>
          <div role="tabpanel" className={cn("h-72", tab !== "hours" && "hidden print:block")}>
            <h3 className="mb-2 text-base font-semibold">My weekly teaching hours by day</h3>
            <ResponsiveContainer width="100%" height="90%" initialDimension={CHART_SIZE}>
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
          </div>
          <div role="tabpanel" className={cn(tab !== "busy" && "hidden print:block")}>
            <Heatmap grid={d.heatmap} />
            <p className="mt-1 text-xs text-muted-foreground">Darker cells are my busiest hours; empty cells are free hours.</p>
          </div>
          <div role="tabpanel" className={cn(tab !== "rooms" && "hidden print:block")}>
            <HoursBars title="Rooms I use most" rows={d.rooms} />
          </div>
          <div role="tabpanel" className={cn("h-72", tab !== "compare" && "hidden print:block")}>
            <h3 className="mb-2 text-base font-semibold">My load compared with the department</h3>
            <ResponsiveContainer width="100%" height="90%" initialDimension={CHART_SIZE}>
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
          </div>
        </CardContent>
      </Card>

      <div>
        <Card>
          <CardHeader><CardTitle className="text-base">Notifications</CardTitle></CardHeader>
          <CardContent>
            {d.notifications.length === 0 ? <p className="text-sm text-muted-foreground">No workload, rescheduling, suspension, or unavailability updates.</p> : (
              <ul className="grid max-h-96 gap-2 overflow-y-auto md:grid-cols-2">
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
      </div>
    </section>
  );
}
