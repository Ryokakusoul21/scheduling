"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { NativeSelect } from "@/components/ux/native-select";
import { ExportButtons, PrintHeader } from "@/components/ux/export-buttons";
import { HEATMAP_DAYS, HEATMAP_HOURS, type RateRow } from "@/lib/analytics/timetable";
import { DAY_LONG, formatTime } from "@/lib/scheduler/timetable";
import { cn } from "@/lib/utils";

type Option = { value: string; label: string };
type Totals = { usedHours: number; capacityHours: number; rate: number };

const TABLES = [
  { key: "rooms", label: "Per room", group: "Building" },
  { key: "buildings", label: "Per building", group: "Rooms" },
  { key: "faculty", label: "Per faculty member", group: "Department" },
  { key: "departments", label: "Per department", group: "Faculty members" },
] as const;

function RateChart({ title, rows, unit }: { title: string; rows: RateRow[]; unit: string }) {
  const data = rows.slice(0, 10).map((r) => ({ name: r.name, rate: r.rate, used: r.usedHours, cap: r.capacityHours }));
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent style={{ height: Math.max(160, data.length * 30 + 40) }}>
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No data for these filters.</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
              <CartesianGrid horizontal={false} stroke="currentColor" opacity={0.08} />
              <XAxis type="number" domain={[0, (max: number) => Math.max(100, Math.ceil(max / 10) * 10)]} unit="%" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="name" width={150} fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip
                cursor={{ fill: "currentColor", opacity: 0.05 }}
                contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, color: "var(--popover-foreground)" }}
                formatter={(_v, _n, p) => [`${p.payload.rate}% (${p.payload.used} of ${p.payload.cap} ${unit})`, "Utilization Rate"]}
              />
              <Bar dataKey="rate" fill="var(--chart-1)" radius={[0, 4, 4, 0]} barSize={14} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

function Heatmap({ grid }: { grid: number[][] }) {
  const max = Math.max(1, ...grid.flat());
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Peak scheduling hours</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-separate border-spacing-0.5 text-[11px]">
            <thead>
              <tr>
                <th />
                {HEATMAP_HOURS.map((h) => <th key={h} className="font-normal text-muted-foreground">{formatTime(h * 60).replace(":00", "")}</th>)}
              </tr>
            </thead>
            <tbody>
              {HEATMAP_DAYS.map((d, i) => (
                <tr key={d}>
                  <th className="pr-2 text-left font-normal text-muted-foreground">{DAY_LONG[d]}</th>
                  {grid[i].map((n, j) => (
                    <td
                      key={j}
                      title={`${DAY_LONG[d]} ${formatTime(HEATMAP_HOURS[j] * 60)}: ${n} class meeting(s) in session`}
                      className="h-8 rounded text-center tabular-nums"
                      // One hue, light to dark: opacity scales with the count.
                      style={{ background: n ? `color-mix(in oklab, var(--chart-1) ${Math.round(15 + (n / max) * 85)}%, transparent)` : "var(--muted)", color: n / max > 0.55 ? "white" : undefined }}
                    >
                      {n || ""}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">Each cell counts the class meetings in session during that hour. Darker cells are busier.</p>
      </CardContent>
    </Card>
  );
}

export function AnalyticsCharts(props: {
  filters: { term: string; department: string; terms: Option[]; departments: Option[]; departmentName: string; termName: string };
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
  const [table, setTable] = useState<(typeof TABLES)[number]["key"]>("rooms");
  const { filters } = props;
  const go = (patch: Record<string, string>) => {
    const p = new URLSearchParams({ term: filters.term, department: filters.department, ...patch });
    for (const [k, v] of [...p.entries()]) if (!v) p.delete(k);
    router.push(`/analytics?${p}`);
  };

  const flat = props.heatmap.flatMap((row, d) => row.map((n, h) => ({ n, d, h })));
  const peak = flat.reduce((a, b) => (b.n > a.n ? b : a), flat[0]);
  const rows: RateRow[] = props[table];
  const spec = TABLES.find((t) => t.key === table)!;
  const unit = table === "rooms" || table === "buildings" ? "available hours" : "maximum hours";

  const tiles = [
    { label: "Overall Room Utilization Rate", value: `${props.roomOverall.rate}%`, hint: `${props.roomOverall.usedHours} of ${props.roomOverall.capacityHours} room-hours per week` },
    { label: "Overall Faculty Utilization Rate", value: `${props.facultyOverall.rate}%`, hint: `${props.facultyOverall.usedHours} of ${props.facultyOverall.capacityHours} teaching hours per week` },
    { label: "Class meetings per week", value: String(props.meetings), hint: filters.termName },
    { label: "Busiest hour", value: peak?.n ? `${DAY_LONG[HEATMAP_DAYS[peak.d]]} ${formatTime(HEATMAP_HOURS[peak.h] * 60)}` : "None", hint: peak?.n ? `${peak.n} meetings in session` : "No classes" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <NativeSelect aria-label="Semester" value={filters.term} onChange={(e) => go({ term: e.target.value })} options={[{ value: "", label: "All active terms" }, ...filters.terms]} className="w-72" />
        {filters.departments.length > 0 && (
          <NativeSelect aria-label="Department" value={filters.department} onChange={(e) => go({ department: e.target.value })} options={[{ value: "", label: "All departments" }, ...filters.departments]} className="w-72" />
        )}
        {filters.departments.length === 0 && <span className="text-sm text-muted-foreground">{filters.departmentName}</span>}
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {tiles.map((t) => (
          <Card key={t.label}>
            <CardContent>
              <p className="text-2xl font-semibold tabular-nums">{t.value}</p>
              <p className="text-xs font-medium">{t.label}</p>
              <p className="truncate text-xs text-muted-foreground">{t.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Heatmap grid={props.heatmap} />

      <div className="grid gap-4 lg:grid-cols-2">
        <RateChart title="Room Utilization Rate by building" rows={props.buildings} unit="available hours" />
        <RateChart title="Faculty Utilization Rate by department" rows={props.departments} unit="maximum hours" />
        <RateChart title="Most used rooms" rows={props.rooms} unit="available hours" />
        <RateChart title="Highest faculty utilization" rows={props.faculty} unit="maximum hours" />
      </div>

      <Card className="print-area">
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 print:hidden">
          <div className="flex flex-wrap gap-1 rounded-md border p-0.5" role="tablist" aria-label="Table">
            {TABLES.map((t) => (
              <button key={t.key} role="tab" aria-selected={table === t.key} onClick={() => setTable(t.key)} className={cn("rounded px-2.5 py-1 text-xs font-medium", table === t.key ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>
                {t.label}
              </button>
            ))}
          </div>
          <ExportButtons
            filename={`utilization-${table}`}
            rows={rows}
            columns={[
              { header: "Name", value: (r) => r.name },
              { header: spec.group, value: (r) => r.group },
              { header: "Scheduled hours per week", value: (r) => r.usedHours },
              { header: table.startsWith("room") || table === "buildings" ? "Available hours per week" : "Maximum hours per week", value: (r) => r.capacityHours },
              { header: "Utilization Rate (percent)", value: (r) => r.rate },
            ]}
          />
        </CardHeader>
        <CardContent>
          <PrintHeader title={`Utilization Rate ${spec.label.toLowerCase()}`} subtitle={`${filters.termName} · ${filters.departmentName}`} />
          <div className="max-h-[480px] overflow-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>{spec.group}</TableHead>
                  <TableHead className="text-right">Scheduled hours</TableHead>
                  <TableHead className="text-right">{unit === "available hours" ? "Available hours" : "Maximum hours"}</TableHead>
                  <TableHead className="w-48">Utilization Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
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
                        <span className="w-12 text-right text-xs tabular-nums">{r.rate}%</span>
                      </div>
                    </TableCell>
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
