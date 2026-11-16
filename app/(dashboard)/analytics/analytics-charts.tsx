"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { NativeSelect } from "@/components/ux/native-select";
import { ReportButtons, PrintHeader } from "@/components/ux/export-buttons";
import { HEATMAP_DAYS, HEATMAP_HOURS, type RateRow } from "@/lib/analytics/timetable";
import { Heatmap, RateChart } from "@/components/charts/utilization";
import { DAY_LONG, formatTime } from "@/lib/scheduler/timetable";
import { cn } from "@/lib/utils";
import { ScheduleInsightPanel } from "@/components/analytics/schedule-insights";
import { SCHEDULE_STATE_LABELS, SCHEDULE_STATES, type ScheduleInsights } from "@/lib/analytics/schedule-insights";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChartBar, Funnel, MagnifyingGlass } from "@phosphor-icons/react/ssr";
import { reportSection } from "@/lib/export/report";

type Option = { value: string; label: string };
type Totals = { usedHours: number; capacityHours: number; rate: number };

const TABLES = [
  { key: "rooms", label: "Per room", group: "Building" },
  { key: "buildings", label: "Per building", group: "Rooms" },
  { key: "faculty", label: "Per faculty member", group: "Department" },
  { key: "departments", label: "Per department", group: "Faculty members" },
] as const;

export function AnalyticsCharts(props: {
  filters: { term: string; department: string; building: string; status: string; level: string; levels: Option[]; terms: Option[]; departments: Option[]; buildings: Option[]; allDepartments: boolean; departmentName: string; termName: string };
  insights: ScheduleInsights;
  meetings: number;
  rooms: RateRow[];
  buildings: RateRow[];
  roomOverall: Totals;
  faculty: RateRow[];
  departments: RateRow[];
  facultyOverall: Totals;
  heatmap: number[][];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [table, setTable] = useState<(typeof TABLES)[number]["key"]>("rooms");
  const [search, setSearch] = useState("");
  const [attentionOnly, setAttentionOnly] = useState(false);
  const { filters } = props;
  const go = (patch: Record<string, string>) => {
    const p = new URLSearchParams({ term: filters.term, department: filters.department, building: filters.building, status: filters.status, level: filters.level, ...patch });
    for (const [k, v] of [...p.entries()]) if (!v) p.delete(k);
    startTransition(() => router.push(`/analytics?${p}`));
  };

  const flat = props.heatmap.flatMap((row, d) => row.map((n, h) => ({ n, d, h })));
  const peak = flat.reduce((a, b) => (b.n > a.n ? b : a), flat[0]);
  const rows: RateRow[] = props[table].filter((row) => (!attentionOnly || row.usedHours > row.capacityHours) && `${row.name} ${row.group}`.toLowerCase().includes(search.trim().toLowerCase()));
  const spec = TABLES.find((t) => t.key === table)!;
  const unit = table === "rooms" || table === "buildings" ? "available hours" : "maximum hours";

  const tiles = [
    { label: "Room capacity in use", value: props.roomOverall.capacityHours ? `${props.roomOverall.rate}%` : "—", hint: `${props.roomOverall.usedHours} / ${props.roomOverall.capacityHours} available room-hours` },
    { label: "Faculty capacity in use", value: props.facultyOverall.capacityHours ? `${props.facultyOverall.rate}%` : "—", hint: `${props.facultyOverall.usedHours} / ${props.facultyOverall.capacityHours} maximum teaching hours` },
    { label: "Peak scheduling hour", value: peak?.n ? `${DAY_LONG[HEATMAP_DAYS[peak.d]]} ${formatTime(HEATMAP_HOURS[peak.h] * 60)}` : "No meetings", hint: peak?.n ? `${peak.n} meetings in session` : "Select another term or workflow status" },
  ];
  const overloaded = props.faculty.filter((row) => row.usedHours > row.capacityHours).length;
  const idleRooms = props.rooms.filter((row) => row.usedHours === 0 && row.capacityHours > 0).length;

  return (
    <div className="space-y-6" aria-busy={pending}>
      <div className="rounded-xl border bg-card p-4 print:hidden">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><p className="flex items-center gap-2 text-sm font-semibold"><Funnel className="size-4 text-primary" />Explore the timetable</p><span className="text-xs text-muted-foreground">{pending ? "Updating analytics…" : `${props.meetings} meetings in selection`}</span></div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <label className="space-y-1 text-xs text-muted-foreground">Academic level<NativeSelect aria-label="Academic level" value={filters.level} onChange={(e) => go({ level: e.target.value, term: "" })} options={[{ value: "", label: "All academic levels" }, ...filters.levels]} className="w-full" /></label>
        <label className="space-y-1 text-xs text-muted-foreground">Term<NativeSelect aria-label="Semester" value={filters.term} onChange={(e) => go({ term: e.target.value })} options={[{ value: "", label: "All active terms" }, ...filters.terms]} className="w-full" /></label>
        {filters.departments.length > 0 && (
          <label className="space-y-1 text-xs text-muted-foreground">Department<NativeSelect aria-label="Department" value={filters.department} onChange={(e) => go({ department: e.target.value })} options={[...(filters.allDepartments ? [{ value: "", label: "All departments" }] : []), ...filters.departments]} className="w-full" /></label>
        )}
        {filters.departments.length === 0 && <div className="space-y-1 text-xs text-muted-foreground">Department<p className="py-2 text-sm font-medium text-foreground">{filters.departmentName}</p></div>}
        <label className="space-y-1 text-xs text-muted-foreground">Building<NativeSelect aria-label="Building" value={filters.building} onChange={(e) => go({ building: e.target.value })} options={[{ value: "", label: "All buildings" }, ...filters.buildings]} className="w-full" /></label>
        <label className="space-y-1 text-xs text-muted-foreground">Schedule status<NativeSelect aria-label="Schedule status" value={filters.status} onChange={(e) => go({ status: e.target.value })} options={[{ value: "ALL", label: "All workflow stages" }, ...SCHEDULE_STATES.map((state) => ({ value: state, label: SCHEDULE_STATE_LABELS[state] }))]} className="w-full" /></label>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">{filters.termName} · {filters.departmentName} · {filters.status === "ALL" ? "Draft, review, and published meetings" : SCHEDULE_STATE_LABELS[filters.status as keyof typeof SCHEDULE_STATE_LABELS]}{filters.status !== "PUBLISHED" ? ". This selection includes schedules that may not be official." : "."}</p>
      </div>

      <ScheduleInsightPanel data={props.insights} />

      <section className="space-y-3" aria-label="Resource utilization">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="flex items-center gap-2 text-base font-semibold"><ChartBar className="size-5 text-primary" />Space & teaching capacity</h2><span className="text-xs text-muted-foreground">Recurring weekly hours in the current selection</span></div>
      <div className="grid gap-3 md:grid-cols-3">
        {tiles.map((t) => (
          <Card key={t.label}>
            <CardContent>
              <p className="text-xl font-semibold tabular-nums">{t.value}</p>
              <p className="text-xs font-medium">{t.label}</p>
              <p className="text-xs text-muted-foreground">{t.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-2 rounded-xl border bg-card px-4 py-3 text-xs text-muted-foreground"><span><strong className={cn(overloaded > 0 && "text-amber-700 dark:text-amber-300")}>{overloaded} faculty above maximum hours.</strong> Review their assignments.</span><span><strong>{idleRooms} rooms have no selected meetings.</strong> Check suitability before reallocating classes.</span></div>
      <p className="text-xs text-muted-foreground">Faculty rates cover selected classes only. Room capacity defaults to 72 hours/week.</p>
      </section>
      <Heatmap grid={props.heatmap} />

      <div className="grid gap-4 lg:grid-cols-2">
        <RateChart title="Room Utilization Rate by building" rows={props.buildings} unit="available hours" />
        <RateChart title="Faculty Utilization Rate by department" rows={props.departments} unit="maximum hours" />
        <RateChart title="Most used rooms" rows={props.rooms} unit="available hours" />
        <RateChart title="Highest faculty utilization" rows={props.faculty} unit="maximum hours" />
      </div>

      <Card className="print-area">
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 print:hidden">
          <div className="flex flex-wrap gap-1 rounded-md border p-0.5" role="group" aria-label="Resource detail view">
            {TABLES.map((t) => (
              <button key={t.key} type="button" aria-pressed={table === t.key} onClick={() => setTable(t.key)} className={cn("rounded px-2.5 py-1 text-xs font-medium focus-visible:ring-2 focus-visible:ring-ring", table === t.key ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>
                {t.label}
              </button>
            ))}
          </div>
          <ReportButtons doc={{
            title: `Timetable Analytics · ${spec.label}`, filename: `utilization-${table}`, landscape: true,
            term: `${filters.termName} · ${filters.departmentName} · ${filters.buildings.find((building) => building.value === filters.building)?.label ?? "All buildings"} · ${filters.status === "ALL" ? "All workflow stages" : SCHEDULE_STATE_LABELS[filters.status as keyof typeof SCHEDULE_STATE_LABELS]}${search ? ` · Resource search: ${search}` : ""}${attentionOnly ? " · Above capacity only" : ""}`,
            rows, columns: [
              { header: "Name", value: (r) => r.name },
              { header: spec.group, value: (r) => r.group },
              { header: "Scheduled hours per week", value: (r) => r.usedHours },
              { header: table.startsWith("room") || table === "buildings" ? "Available hours per week" : "Maximum hours per week", value: (r) => r.capacityHours },
              { header: "Utilization Rate (percent)", value: (r) => r.capacityHours ? r.rate : "Not configured" },
            ],
            extra: [reportSection("Schedule Summary for the Selected Timetable", [{ header: "Metric", value: (row: { metric: string; value: number | string }) => row.metric }, { header: "Value", value: (row) => row.value }], [
              { metric: "Class meetings", value: props.insights.total }, { metric: "Weekly teaching hours (combined weekly patterns)", value: props.insights.weeklyHours },
              { metric: "Published meetings", value: props.insights.published }, { metric: "Recurring overlapping meeting pairs", value: props.insights.conflictPairs },
              { metric: "Scope of capacity table", value: "Capacity table uses the resource search and above-capacity filter; schedule summary uses the timetable filters." },
            ])],
          }} />
        </CardHeader>
        <CardContent>
          <PrintHeader title={`Utilization Rate ${spec.label.toLowerCase()}`} subtitle={`${filters.termName} · ${filters.departmentName}`} />
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden"><label className="relative w-full sm:max-w-xs"><MagnifyingGlass className="absolute left-3 top-2.5 size-4 text-muted-foreground" aria-hidden /><Input aria-label="Search utilization details" placeholder="Search a name or group…" value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" /></label><Button type="button" variant={attentionOnly ? "secondary" : "outline"} size="sm" aria-pressed={attentionOnly} onClick={() => setAttentionOnly(!attentionOnly)}>Above capacity only</Button><span className="text-xs text-muted-foreground">{rows.length} records</span></div>
          <div className="max-h-[480px] overflow-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>{spec.group}</TableHead>
                  <TableHead className="text-right">Scheduled hours</TableHead>
                  <TableHead className="text-right">{unit === "available hours" ? "Available hours" : "Maximum hours"}</TableHead>
                  <TableHead className="w-48">Utilization Rate</TableHead>
                  <TableHead>Capacity status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 && <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">No resources match this selection. Try another status, term, or search.</TableCell></TableRow>}
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell>{r.group}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.usedHours}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.capacityHours}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden>
                          <div className="h-full rounded-full bg-[var(--chart-1)]" style={{ width: `${Math.min(r.rate, 100)}%` }} />
                        </div>
                        <span className="w-12 text-right text-xs tabular-nums">{r.capacityHours ? `${r.rate}%` : "—"}</span>
                      </div>
                    </TableCell>
                    <TableCell><Badge variant={r.usedHours > r.capacityHours ? "destructive" : "secondary"}>{r.capacityHours <= 0 ? "No capacity set" : r.usedHours > r.capacityHours ? "Above capacity" : !r.usedHours ? "No selected meetings" : "Within capacity"}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
