"use client";

import { Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart, LabelList, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TOOLTIP_STYLE, CHART_SIZE } from "@/components/charts/utilization";
import { LOAD_STATUS } from "@/components/workload/load-bar";
import type { LoadStatus } from "@/lib/workload/optimizer";
import { formatRange } from "@/lib/scheduler/timetable";
import { formatLongDate } from "@/lib/calendar";

/** Chart and list pieces shared by the role dashboards. */

const STATUS_FILL: Record<LoadStatus, string> = { OVERLOADED: "#dc2626", UNDERLOADED: "#d97706", BALANCED: "#059669" };

export function LoadDistributionChart({ data }: { data: { status: LoadStatus; count: number }[] }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Faculty teaching load distribution</CardTitle></CardHeader>
      <CardContent className="h-56">
        <ResponsiveContainer width="100%" height="100%" initialDimension={CHART_SIZE}>
          <BarChart data={data.map((l) => ({ name: LOAD_STATUS[l.status].label, count: l.count, status: l.status }))} margin={{ top: 20 }}>
            <CartesianGrid vertical={false} stroke="currentColor" opacity={0.08} />
            <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} />
            <YAxis allowDecimals={false} fontSize={11} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "currentColor", opacity: 0.05 }} formatter={(v) => [v, "Faculty"]} />
            <Bar dataKey="count" radius={[4, 4, 0, 0]} barSize={48}>
              {data.map((l) => <Cell key={l.status} fill={STATUS_FILL[l.status]} />)}
              <LabelList dataKey="count" position="top" fontSize={12} fill="currentColor" />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

export interface EnrollmentData {
  points: { label: string; enrolled: number }[];
  forecast: { label: string; value: number; low: number; high: number } | null;
}

export function EnrollmentChart({ data, title = "Enrollment trend and forecast", children }: { data: EnrollmentData; title?: string; children?: React.ReactNode }) {
  const rows = [
    ...data.points.map((p) => ({ label: p.label, actual: p.enrolled })),
    ...(data.forecast ? [{ label: data.forecast.label, forecast: data.forecast.value, range: [data.forecast.low, data.forecast.high] }] : []),
  ] as { label: string; actual?: number; forecast?: number; range?: number[] }[];
  // Connect the forecast line to the last actual point.
  const last = rows.filter((p) => p.actual !== undefined).at(-1);
  if (last && data.forecast) Object.assign(last, { forecast: last.actual, range: [last.actual, last.actual] });
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="h-60">
          {rows.length === 0 ? <p className="text-sm text-muted-foreground">No enrollment history.</p> : (
            <ResponsiveContainer width="100%" height="100%" initialDimension={CHART_SIZE}>
              <ComposedChart data={rows} margin={{ left: 0, right: 16, top: 8 }}>
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
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

export function WeeklyChart({ data }: { data: Record<string, string | number>[] }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Room bookings and conflicts resolved per week</CardTitle></CardHeader>
      <CardContent className="h-64">
        <ResponsiveContainer width="100%" height="100%" initialDimension={CHART_SIZE}>
          <LineChart data={data.map((w) => ({ ...w, label: formatLongDate(String(w.week), { month: "short", day: "numeric" }) }))} margin={{ left: 0, right: 16, top: 8 }}>
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
  );
}

export interface UpcomingItem {
  id: string;
  kind: string;
  date: string;
  endDate: string;
  startMin: number | null;
  endMin: number | null;
  title: string;
  detail: string;
}

export function UpcomingList({ items, title = "Upcoming examinations and activities" }: { items: UpcomingItem[]; title?: string }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent>
        {items.length === 0 ? <p className="text-sm text-muted-foreground">Nothing in the next three weeks.</p> : (
          <ul className="divide-y rounded-lg border">
            {items.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center gap-3 p-2.5 text-sm">
                <span className="w-36 shrink-0 text-xs font-medium">
                  {formatLongDate(u.date, { weekday: "short", month: "short", day: "numeric" })}
                  {u.endDate !== u.date && ` to ${formatLongDate(u.endDate, { month: "short", day: "numeric" })}`}
                  {u.startMin !== null && u.endMin !== null && <span className="block font-normal text-muted-foreground">{formatRange(u.startMin, u.endMin)}</span>}
                </span>
                <Badge variant={u.kind.startsWith("Examination") ? "default" : "secondary"}>{u.kind}</Badge>
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
  );
}

/** Simple horizontal bars of hours, for "rooms used most" lists. */
export function HoursBars({ title, rows, unit = "hours per week" }: { title: string; rows: { name: string; hours: number }[]; unit?: string }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent style={{ height: Math.max(140, rows.length * 30 + 40) }}>
        {rows.length === 0 ? <p className="text-sm text-muted-foreground">No classes yet.</p> : (
          <ResponsiveContainer width="100%" height="100%" initialDimension={CHART_SIZE}>
            <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 32 }}>
              <CartesianGrid horizontal={false} stroke="currentColor" opacity={0.08} />
              <XAxis type="number" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
              <YAxis type="category" dataKey="name" width={150} fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "currentColor", opacity: 0.05 }} formatter={(v) => [`${v} ${unit}`, "Scheduled"]} />
              <Bar dataKey="hours" fill="var(--chart-1)" radius={[0, 4, 4, 0]} barSize={14}>
                <LabelList dataKey="hours" position="right" fontSize={11} fill="currentColor" />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
