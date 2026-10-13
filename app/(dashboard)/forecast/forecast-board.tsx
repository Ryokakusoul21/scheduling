"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Area, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Sparkle, TrendDown, TrendUp, Minus } from "@phosphor-icons/react/ssr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { NativeSelect } from "@/components/ux/native-select";
import { ExportButtons, PrintHeader } from "@/components/ux/export-buttons";
import type { SeriesForecast } from "@/lib/forecast/load";
import { cn } from "@/lib/utils";

type Option = { value: string; label: string };
type Gap = { diff: number; status: "SHORTAGE" | "SURPLUS" | "MATCH" };

function GapBadge({ g, noun }: { g: Gap; noun: string }) {
  if (g.status === "MATCH") return <Badge variant="outline">Exactly enough</Badge>;
  const n = Math.abs(g.diff);
  return (
    <Badge variant={g.status === "SHORTAGE" ? "destructive" : "secondary"} className="gap-1">
      {g.status === "SHORTAGE" ? <TrendDown className="size-3" /> : <TrendUp className="size-3" />}
      {g.status === "SHORTAGE" ? `Short by ${n}` : `${n} spare`} {noun}
    </Badge>
  );
}

const CONFIDENCE_STYLE = { High: "text-emerald-700 dark:text-emerald-400", Medium: "text-amber-700 dark:text-amber-400", Low: "text-red-700 dark:text-red-400" };

export function ForecastBoard(props: {
  target: string;
  targetLabel: string;
  targets: Option[];
  department: string;
  departments: Option[];
  series: SeriesForecast[];
  facultyRows: { id: string; name: string; hours: number; needed: number; now: number; diff: number; status: Gap["status"] }[];
  roomRows: { type: string; hours: number; needed: number; now: number; diff: number; status: Gap["status"] }[];
  assumptions: { loadPerFaculty: number; roomWeeklyHours: number; targetUtilization: number };
  narrative: string | null;
  aiEnabled: boolean;
}) {
  const router = useRouter();
  const [focus, setFocus] = useState(props.series[0]?.key ?? "");
  const go = (patch: Record<string, string>) => {
    const p = new URLSearchParams({ target: props.target, department: props.department, ...patch });
    for (const [k, v] of [...p.entries()]) if (!v) p.delete(k);
    router.push(`/forecast?${p}`);
  };
  const termType = props.target.split("-")[1];
  const selected = props.series.find((s) => s.key === focus) ?? props.series[0];

  // Only the same term type is plotted so first and second semesters do not zigzag.
  const chart = useMemo(() => {
    if (!selected) return [];
    const same = selected.history.filter((h) => h.termType === termType);
    const points = (same.length >= 2 ? same : selected.history.filter((h) => h.termType === "FIRST")).map((h) => ({ label: `${h.year}-${h.year + 1}`, actual: h.enrolled }));
    const p = selected.prediction;
    if (p) {
      const last = points.at(-1);
      if (last) Object.assign(last, { forecast: last.actual, range: [last.actual, last.actual] });
      points.push({ label: props.targetLabel.split(" ").pop()!, forecast: p.value, range: [p.low, p.high] } as never);
    }
    return points;
  }, [selected, termType, props.targetLabel]);

  const totals = {
    forecast: props.series.reduce((t, s) => t + (s.prediction?.value ?? 0), 0),
    last: props.series.reduce((t, s) => t + (s.lastActual ?? 0), 0),
    sectionsNeeded: props.series.reduce((t, s) => t + s.sectionsNeeded, 0),
    sectionsNow: props.series.reduce((t, s) => t + s.sectionsNow, 0),
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <NativeSelect aria-label="Forecast term" value={props.target} onChange={(e) => go({ target: e.target.value })} options={props.targets} className="w-64" />
        {props.departments.length > 0 && (
          <NativeSelect aria-label="Department" value={props.department} onChange={(e) => go({ department: e.target.value })} options={[{ value: "", label: "All departments" }, ...props.departments]} className="w-72" />
        )}
        {props.aiEnabled && !props.narrative && (
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/forecast?${new URLSearchParams({ target: props.target, department: props.department, explain: "1" })}`} />}>
            <Sparkle className="size-4" /> Explain with artificial intelligence
          </Button>
        )}
      </div>

      {props.narrative && (
        <Card><CardContent className="flex gap-2 text-sm"><Sparkle className="mt-0.5 size-4 shrink-0 text-primary" />{props.narrative}</CardContent></Card>
      )}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[
          { label: `Forecast enrollment, ${props.targetLabel}`, value: totals.forecast.toLocaleString(), hint: `Latest actual: ${totals.last.toLocaleString()}` },
          { label: "Sections needed", value: totals.sectionsNeeded, hint: `${totals.sectionsNow} sections now` },
          { label: "Faculty needed", value: props.facultyRows.reduce((t, r) => t + r.needed, 0), hint: `${props.facultyRows.reduce((t, r) => t + r.now, 0)} active faculty now` },
          { label: "Rooms needed", value: props.roomRows.reduce((t, r) => t + r.needed, 0), hint: `${props.roomRows.reduce((t, r) => t + r.now, 0)} suitable rooms open now` },
        ].map((t) => (
          <Card key={t.label}>
            <CardContent>
              <p className="text-2xl font-semibold tabular-nums">{t.value}</p>
              <p className="text-xs font-medium">{t.label}</p>
              <p className="text-xs text-muted-foreground">{t.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {selected && (
        <Card>
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">Enrollment history and forecast</CardTitle>
            <NativeSelect aria-label="Program" value={selected.key} onChange={(e) => setFocus(e.target.value)} options={props.series.map((s) => ({ value: s.key, label: s.name }))} className="w-80" />
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chart} margin={{ left: 0, right: 16, top: 8 }}>
                <CartesianGrid vertical={false} stroke="currentColor" opacity={0.08} />
                <XAxis dataKey="label" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, color: "var(--popover-foreground)" }} formatter={(v, n) => [Array.isArray(v) ? `${v[0]} to ${v[1]}` : v, n]} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area dataKey="range" name="Forecast range (80 percent)" stroke="none" fill="var(--chart-1)" fillOpacity={0.15} isAnimationActive={false} />
                <Line dataKey="actual" name="Actual enrollment" stroke="var(--chart-1)" strokeWidth={2} dot={{ r: 4 }} isAnimationActive={false} />
                <Line dataKey="forecast" name="Forecast" stroke="var(--chart-1)" strokeWidth={2} strokeDasharray="5 4" dot={{ r: 4 }} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <Card className="print-area">
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 print:hidden">
          <CardTitle className="text-base">Forecast by program</CardTitle>
          <ExportButtons
            filename="enrollment-forecast"
            rows={props.series}
            columns={[
              { header: "Program or level", value: (s) => s.name },
              { header: "Department", value: (s) => s.departmentName },
              { header: "Latest actual", value: (s) => s.lastActual },
              { header: "Forecast", value: (s) => s.prediction?.value },
              { header: "Low (80 percent)", value: (s) => s.prediction?.low },
              { header: "High (80 percent)", value: (s) => s.prediction?.high },
              { header: "Confidence", value: (s) => s.prediction?.confidence },
              { header: "Sections needed", value: (s) => s.sectionsNeeded },
              { header: "Sections now", value: (s) => s.sectionsNow },
              { header: "Students per section", value: (s) => s.sectionSize },
            ]}
          />
        </CardHeader>
        <CardContent>
          <PrintHeader title={`Enrollment Forecast, ${props.targetLabel}`} />
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Program or level</TableHead>
                  <TableHead className="text-right">Latest</TableHead>
                  <TableHead className="text-right">Forecast</TableHead>
                  <TableHead>Range and confidence</TableHead>
                  <TableHead>Trend per year</TableHead>
                  <TableHead>Sections needed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {props.series.map((s) => (
                  <TableRow key={s.key}>
                    <TableCell>
                      <p className="font-medium">{s.name}</p>
                      <p className="text-xs text-muted-foreground">{s.departmentName}</p>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{s.lastActual ?? "None"}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{s.prediction?.value ?? "None"}</TableCell>
                    <TableCell className="text-xs">
                      {s.prediction && (<>
                        <p className="tabular-nums">{s.prediction.low} to {s.prediction.high}</p>
                        <p className={cn("font-medium", CONFIDENCE_STYLE[s.prediction.confidence])}>{s.prediction.confidence} confidence · {s.prediction.points} terms of data</p>
                      </>)}
                    </TableCell>
                    <TableCell className="text-xs">
                      {s.prediction && (
                        <span className="flex items-center gap-1">
                          {s.prediction.slope > 0 ? <TrendUp className="size-3.5" /> : s.prediction.slope < 0 ? <TrendDown className="size-3.5" /> : <Minus className="size-3.5" />}
                          {s.prediction.slope > 0 ? "+" : ""}{s.prediction.slope} students
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="space-y-1 text-xs">
                      <p className="tabular-nums">{s.sectionsNeeded} needed · {s.sectionsNow} now</p>
                      <GapBadge g={s.sectionGap} noun="sections" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Faculty needed by department</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Department</TableHead><TableHead className="text-right">Weekly hours</TableHead><TableHead className="text-right">Needed</TableHead><TableHead className="text-right">Now</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>
                {props.facultyRows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.hours}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.needed}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.now}</TableCell>
                    <TableCell><GapBadge g={r} noun="faculty" /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Room demand by type</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Room type</TableHead><TableHead className="text-right">Weekly hours</TableHead><TableHead className="text-right">Needed</TableHead><TableHead className="text-right">Open now</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>
                {props.roomRows.map((r) => (
                  <TableRow key={r.type}>
                    <TableCell className="font-medium">{r.type}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.hours}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.needed}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.now}</TableCell>
                    <TableCell><GapBadge g={r} noun="rooms" /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Assumptions</CardTitle></CardHeader>
        <CardContent>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Enrollment follows a straight-line trend fitted to past academic years for the same term (first or second semester); the range covers 80 percent of likely outcomes.</li>
            <li>Confidence is High with five or more terms of data and a range within 8 percent of the forecast, Medium within 15 percent with four or more terms, and Low otherwise.</li>
            <li>Students per section use each program&apos;s current average section size (40 when it has no sections).</li>
            <li>Weekly hours per section and the laboratory share come from the current timetable; programs with no or only partial timetables use 20 hours (College), 25 (Senior High School and Elementary), or 30 (Junior High School).{props.series.some((s) => s.assumedDefaults) && " Programs using these defaults: " + props.series.filter((s) => s.assumedDefaults).map((s) => s.name).join(", ") + "."}</li>
            <li>One faculty member teaches up to {props.assumptions.loadPerFaculty} hours a week (the maximum load in System Settings).</li>
            <li>A room is open {props.assumptions.roomWeeklyHours} hours a week and is planned at {Math.round(props.assumptions.targetUtilization * 100)} percent use, leaving room for bookings and make-up classes.</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
