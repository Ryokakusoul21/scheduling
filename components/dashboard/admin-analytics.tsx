"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart, LabelList, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowDown, ArrowUp, CircleNotch, Minus } from "@phosphor-icons/react/ssr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { NativeSelect } from "@/components/ux/native-select";
import { ExportButtons, PrintHeader } from "@/components/ux/export-buttons";
import { Heatmap, RateChart, TOOLTIP_STYLE } from "@/components/charts/utilization";
import { LOAD_STATUS } from "@/components/workload/load-bar";
import { HEATMAP_DAYS, HEATMAP_HOURS } from "@/lib/analytics/timetable";
import type { DashboardAnalytics } from "@/lib/analytics/dashboard";
import type { Change } from "@/lib/analytics/trends";
import { DAY_LONG, formatRange, formatTime } from "@/lib/scheduler/timetable";
import { formatLongDate } from "@/lib/calendar";
import { cn } from "@/lib/utils";

type Option = { value: string; label: string };

/** Change against the previous semester, colored by whether the direction is good news, with an arrow and text. */
function ChangeBadge({ change, previous }: { change: Change; previous: string | null }) {
  if (change.value === null) return <span className="text-[11px] text-muted-foreground">No data for the previous semester</span>;
  const unit = change.unit === "percent" ? "%" : " points";
  if (change.value === 0) return <span className="flex items-center gap-1 text-[11px] text-muted-foreground"><Minus className="size-3" /> No change from {previous}</span>;
  const up = change.value > 0;
  const good = up === change.upIsGood;
  return (
    <span className={cn("flex items-center gap-1 text-[11px] font-medium", good ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400")}>
      {up ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
      {up ? "+" : ""}{change.value}{unit} from {previous}
    </span>
  );
}

/** Builds one spreadsheet with a titled block per table of the analytics report. */
function reportBlocks(d: DashboardAnalytics, filters: string) {
  const day = (i: number) => DAY_LONG[HEATMAP_DAYS[i]];
  return [
    { title: `Administrator analytics, ${d.term.label} (${filters})`, header: ["Measure", "Value", "Change from previous semester"], rows: d.cards.map((c) => [c.label, c.value, c.change.value === null ? "No data" : `${c.change.value}${c.change.unit === "percent" ? " percent" : " points"}`]) },
    { title: "Room Utilization Rate per building", header: ["Building", "Rooms", "Scheduled hours", "Available hours", "Utilization Rate (percent)"], rows: d.buildings.map((r) => [r.name, r.group, r.usedHours, r.capacityHours, r.rate]) },
    { title: "Room Utilization Rate per room", header: ["Room", "Building", "Scheduled hours", "Available hours", "Utilization Rate (percent)", "Note"], rows: d.rooms.map((r) => [r.name, r.group, r.usedHours, r.capacityHours, r.rate, r.mark === "MOST" ? "Most used" : r.mark === "LEAST" ? "Least used" : ""]) },
    { title: "Faculty Utilization Rate per department", header: ["Department", "Faculty", "Teaching hours", "Maximum hours", "Utilization Rate (percent)"], rows: d.departments.map((r) => [r.name, r.group, r.usedHours, r.capacityHours, r.rate]) },
    { title: "Peak scheduling hours (class meetings in session)", header: ["Day", ...HEATMAP_HOURS.map((h) => formatTime(h * 60))], rows: d.heatmap.map((row, i) => [day(i), ...row]) },
    { title: "Enrollment trend", header: ["Term", "Students"], rows: [...d.enrollment.points.map((p) => [p.label, p.enrolled]), ...(d.enrollment.forecast ? [[`${d.enrollment.forecast.label} (forecast, range ${d.enrollment.forecast.low} to ${d.enrollment.forecast.high})`, d.enrollment.forecast.value]] : [])] },
    { title: "Faculty teaching load distribution", header: ["Status", "Faculty"], rows: d.loadDistribution.map((l) => [LOAD_STATUS[l.status].label, l.count]) },
    { title: "Room bookings and conflicts resolved per week", header: ["Week starting", "Room bookings", "Conflicts resolved"], rows: d.weekly.map((w) => [w.week, w.bookings, w.resolved]) },
    { title: "Upcoming examinations and activities", header: ["Date", "Type", "Title", "Details"], rows: d.upcoming.map((u) => [u.date === u.endDate ? u.date : `${u.date} to ${u.endDate}`, u.kind, u.title, u.detail]) },
  ];
}

export function AdminAnalytics({
  data,
  filters,
}: {
  data: DashboardAnalytics;
  filters: { term: string; department: string; building: string; terms: Option[]; departments: Option[]; buildings: Option[] };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    startTransition(() => router.replace(`${pathname}?${next}`, { scroll: false }));
  };
  const filterText = [
    filters.departments.find((d) => d.value === filters.department)?.label ?? "All departments",
    filters.buildings.find((b) => b.value === filters.building)?.label ?? "All buildings",
  ].join(", ");

  // Spreadsheet export: one block per table, separated by blank lines.
  const blocks = reportBlocks(data, filterText);
  const flat = blocks.flatMap((b) => [[b.title], b.header, ...b.rows, []]);
  const width = Math.max(...flat.map((r) => r.length));

  const enrollment = [
    ...data.enrollment.points.map((p) => ({ label: p.label, actual: p.enrolled })),
    ...(data.enrollment.forecast
      ? [{ label: data.enrollment.forecast.label, forecast: data.enrollment.forecast.value, range: [data.enrollment.forecast.low, data.enrollment.forecast.high] }]
      : []),
  ] as { label: string; actual?: number; forecast?: number; range?: number[] }[];
  // Connect the forecast line to the last actual point.
  const lastActual = enrollment.filter((p) => p.actual !== undefined).at(-1);
  if (lastActual && data.enrollment.forecast) Object.assign(lastActual, { forecast: lastActual.actual, range: [lastActual.actual, lastActual.actual] });

  const weekLabel = (w: string) => formatLongDate(w, { month: "short", day: "numeric" });

  return (
    <section aria-labelledby="analytics-title" className="print-area space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="analytics-title" className="flex items-center gap-2 text-lg font-semibold">
          Data analytics {pending && <CircleNotch className="size-4 animate-spin text-muted-foreground" aria-label="Updating" />}
        </h2>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <NativeSelect aria-label="Semester" value={filters.term} onChange={(e) => set("term", e.target.value)} options={filters.terms} className="w-64" />
          <NativeSelect aria-label="Department" value={filters.department} onChange={(e) => set("department", e.target.value)} options={[{ value: "", label: "All departments" }, ...filters.departments]} className="w-60" />
          <NativeSelect aria-label="Building" value={filters.building} onChange={(e) => set("building", e.target.value)} options={[{ value: "", label: "All buildings" }, ...filters.buildings]} className="w-56" />
          <ExportButtons filename="administrator-analytics-report" rows={flat.slice(1)} columns={Array.from({ length: width }, (_, i) => ({ header: String(flat[0][i] ?? ""), value: (r: (string | number)[]) => r[i] }))} />
        </div>
      </div>
      <PrintHeader title={`Administrator Analytics Report: ${data.term.label}`} subtitle={filterText} />

      <div className={cn("grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4", pending && "opacity-70")}>
        {data.cards.map((c) => (
          <Card key={c.key}>
            <CardContent className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">{c.label}</p>
              <p className="text-xl font-semibold tabular-nums">{c.value}</p>
              <ChangeBadge change={c.change} previous={data.previousLabel} />
              <p className="text-[11px] text-muted-foreground">{c.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <RateChart title="Room Utilization Rate per building" rows={data.buildings} unit="available hours" />
        <RateChart title="Room Utilization Rate per room" rows={data.rooms} unit="available hours" limit={12} />
        <RateChart title="Faculty Utilization Rate per department" rows={data.departments} unit="maximum hours" />
        <Card>
          <CardHeader><CardTitle className="text-base">Faculty teaching load distribution</CardTitle></CardHeader>
          <CardContent className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.loadDistribution.map((l) => ({ name: LOAD_STATUS[l.status].label, count: l.count, status: l.status }))} margin={{ top: 20 }}>
                <CartesianGrid vertical={false} stroke="currentColor" opacity={0.08} />
                <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "currentColor", opacity: 0.05 }} formatter={(v) => [v, "Faculty"]} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]} barSize={48}>
                  {data.loadDistribution.map((l) => (
                    <Cell key={l.status} fill={l.status === "OVERLOADED" ? "#dc2626" : l.status === "UNDERLOADED" ? "#d97706" : "#059669"} />
                  ))}
                  <LabelList dataKey="count" position="top" fontSize={12} fill="currentColor" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Heatmap grid={data.heatmap} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Enrollment trend and forecast</CardTitle></CardHeader>
          <CardContent className="h-64">
            {enrollment.length === 0 ? <p className="text-sm text-muted-foreground">No enrollment history for this level.</p> : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={enrollment} margin={{ left: 0, right: 16, top: 8 }}>
                  <CartesianGrid vertical={false} stroke="currentColor" opacity={0.08} />
                  <XAxis dataKey="label" fontSize={10} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v, n) => [Array.isArray(v) ? `${v[0]} to ${v[1]}` : v, n]} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Area dataKey="range" name="Forecast range (80 percent)" stroke="none" fill="var(--chart-1)" fillOpacity={0.15} isAnimationActive={false} />
                  <Line dataKey="actual" name="Students enrolled" stroke="var(--chart-1)" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
                  <Line dataKey="forecast" name="Forecast" stroke="var(--chart-1)" strokeWidth={2} strokeDasharray="5 4" dot={{ r: 4 }} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Room bookings and conflicts resolved per week</CardTitle></CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.weekly.map((w) => ({ ...w, label: weekLabel(String(w.week)) }))} margin={{ left: 0, right: 16, top: 8 }}>
                <CartesianGrid vertical={false} stroke="currentColor" opacity={0.08} />
                <XAxis dataKey="label" fontSize={10} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis allowDecimals={false} fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={(l) => `Week of ${l}`} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line dataKey="bookings" name="Room bookings" stroke="var(--chart-1)" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
                <Line dataKey="resolved" name="Conflicts resolved automatically" stroke="var(--chart-5)" strokeWidth={2} strokeDasharray="4 3" dot={{ r: 3 }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Upcoming examinations and activities</CardTitle></CardHeader>
        <CardContent>
          {data.upcoming.length === 0 ? <p className="text-sm text-muted-foreground">Nothing in the next three weeks.</p> : (
            <ul className="divide-y rounded-lg border">
              {data.upcoming.map((u) => (
                <li key={u.id} className="flex flex-wrap items-center gap-3 p-2.5 text-sm">
                  <span className="w-36 shrink-0 text-xs font-medium">
                    {formatLongDate(u.date, { weekday: "short", month: "short", day: "numeric" })}
                    {u.endDate !== u.date && ` to ${formatLongDate(u.endDate, { month: "short", day: "numeric" })}`}
                    {u.startMin !== null && u.endMin !== null && <span className="block font-normal text-muted-foreground">{formatRange(u.startMin, u.endMin)}</span>}
                  </span>
                  <Badge variant={u.kind === "Examination" ? "default" : "secondary"}>{u.kind}</Badge>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{u.title}</span>
                    {u.detail && <span className="block truncate text-xs text-muted-foreground">{u.detail}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
