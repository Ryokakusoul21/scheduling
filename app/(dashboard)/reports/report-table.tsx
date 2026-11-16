"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ReportButtons } from "@/components/ux/export-buttons";
import { Pagination, usePagination } from "@/components/ux/pagination";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { levelLabel } from "@/lib/academics/levels";
import { EVENT_LABELS, formatLongDate } from "@/lib/calendar";
import { ACTIVITY_COLUMNS, reportSection, type ActivityRow, type ReportDoc } from "@/lib/export/report";
import { affectsOf, type Affect, type ReportActivity } from "@/lib/reports/affected";
import { ScheduleInsightPanel } from "@/components/analytics/schedule-insights";
import { scheduleInsights, SCHEDULE_STATE_LABELS, SCHEDULE_STATES, WEEK_DAYS } from "@/lib/analytics/schedule-insights";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Funnel, MagnifyingGlass, ArrowCounterClockwise } from "@phosphor-icons/react/ssr";

interface Row {
  id: string;
  semesterLabel: string;
  semesterId: string;
  termStart: string;
  termEnd: string;
  subjectLabel: string;
  sectionLabel: string;
  sectionId: string;
  departmentId: string | null;
  level: string;
  facultyLabel: string;
  facultyId: string;
  roomLabel: string;
  roomId: string;
  buildingId: string | null;
  dayOfWeek: string;
  startMin: number;
  endMin: number;
  status: string;
}

type Activity = ReportActivity & { description: string; department: string; location: string };
type ReportRow = Row & { affects: Affect[] };
type Option = { id: string; label: string };

const STATUS_LABELS: Record<string, string> = { DRAFT: "Draft", REVIEW: "Awaiting approval", PUBLISHED: "Published", ARCHIVED: "Archived" };
const AFFECT_LABEL: Record<string, string> = { HOLIDAY: "Holiday", CLASS_SUSPENSION: "Class suspension", SCHOOL_EVENT: "Activity" };
const AFFECT_COLOR: Record<string, string> = {
  HOLIDAY: "border-rose-500/50 bg-rose-500/10 text-rose-800 dark:text-rose-200",
  CLASS_SUSPENSION: "border-orange-500/50 bg-orange-500/15 text-orange-900 dark:text-orange-200",
  SCHOOL_EVENT: "border-amber-500/50 bg-amber-500/15 text-amber-900 dark:text-amber-200",
};

function formatTime(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

const shortDate = (d: string) => formatLongDate(d, { month: "short", day: "numeric" });
const affectText = (list: Affect[]) => list.map((a) => `${shortDate(a.date)} ${AFFECT_LABEL[a.type]}: ${a.title}`).join("; ");

function FilterSelect({ label, value, onChange, options, className }: { label: string; value: string; onChange: (v: string) => void; options: Option[]; className?: string }) {
  const all = `All ${label}`;
  return (
    <Select items={[{ value: "ALL", label: all }, ...options.map((o) => ({ value: o.id, label: o.label }))]} value={value} onValueChange={(v) => onChange(v ?? "ALL")}>
      <SelectTrigger className={className} aria-label={label}><SelectValue placeholder={label} /></SelectTrigger>
      <SelectContent>
        <SelectItem value="ALL">{all}</SelectItem>
        {options.map((o) => <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

export function ScheduleReportTable({
  rows,
  activities,
  semesters,
  departments,
  sections,
  faculty,
  rooms,
  buildings,
  activeLevel,
  initialFilters,
}: {
  rows: Row[];
  activities: Activity[];
  semesters: (Option & { start: string; end: string })[];
  departments: Option[];
  sections: Option[];
  faculty: Option[];
  rooms: Option[];
  buildings: Option[];
  activeLevel: string;
  initialFilters: { term: string; department: string; status: string; building: string };
}) {
  const [semesterId, setSemesterId] = useState(initialFilters.term);
  const [departmentId, setDepartmentId] = useState(initialFilters.department);
  const level = activeLevel;
  const [sectionId, setSectionId] = useState("ALL");
  const [facultyId, setFacultyId] = useState("ALL");
  const [roomId, setRoomId] = useState("ALL");
  const [buildingId, setBuildingId] = useState(initialFilters.building);
  const [status, setStatus] = useState(initialFilters.status);
  const [day, setDay] = useState("ALL");
  const [search, setSearch] = useState("");
  const [issue, setIssue] = useState("ALL");
  const pick = (v: string, id: string | null) => v === "ALL" || v === id;

  const selection = useMemo(
    () =>
      rows
        .filter(
          (r) =>
            pick(semesterId, r.semesterId) && pick(departmentId, r.departmentId) && pick(level, r.level) &&
            pick(sectionId, r.sectionId) && pick(facultyId, r.facultyId) && pick(roomId, r.roomId) && pick(buildingId, r.buildingId) && pick(status, r.status) && pick(day, r.dayOfWeek) &&
            `${r.subjectLabel} ${r.sectionLabel} ${r.facultyLabel} ${r.roomLabel}`.toLowerCase().includes(search.trim().toLowerCase()),
        )
        .map((r): ReportRow => ({ ...r, affects: affectsOf(r, activities) })),
    [rows, activities, semesterId, departmentId, level, sectionId, facultyId, roomId, buildingId, status, day, search],
  );
  const selectionInsights = useMemo(() => scheduleInsights(selection), [selection]);
  const conflictIds = useMemo(() => new Set(selectionInsights.conflictIds), [selectionInsights]);
  const filtered = useMemo(() => selection.filter((row) => issue === "CONFLICTS" ? conflictIds.has(row.id) : issue === "AFFECTED" ? row.affects.length > 0 : true), [selection, issue, conflictIds]);
  const insights = useMemo(() => scheduleInsights(filtered), [filtered]);
  const reset = () => {
    setSemesterId("ALL"); setDepartmentId("ALL"); setSectionId("ALL"); setFacultyId("ALL"); setRoomId("ALL"); setBuildingId("ALL"); setStatus("PUBLISHED"); setDay("ALL"); setSearch(""); setIssue("ALL");
  };

  // Activities in the chosen term (or any term), for the chosen department and level, plus anything touching a listed class.
  const shownActivities = useMemo(() => {
    const term = semesters.find((s) => s.id === semesterId);
    const touched = new Set(filtered.flatMap((r) => r.affects.map((a) => a.title)));
    const inWindow = (a: Activity) => (term ? a.startDate <= term.end && a.endDate >= term.start : semesters.some((s) => a.startDate <= s.end && a.endDate >= s.start));
    return activities.filter(
      (a) =>
        inWindow(a) &&
        (touched.has(a.title) ||
          (a.type !== "CLASS_SUSPENSION" && (departmentId === "ALL" || !a.departmentId || a.departmentId === departmentId) && (level === "ALL" || !a.level || a.level === level))),
    );
  }, [activities, semesters, semesterId, departmentId, level, filtered]);

  const affectedCount = filtered.filter((r) => r.affects.length > 0).length;
  const paging = usePagination(filtered, 10, [semesterId, departmentId, level, sectionId, facultyId, roomId, buildingId, status, day, search, issue].join("|"));
  const termLabel = semesters.find((s) => s.id === semesterId)?.label ?? "All semesters";

  const activityRows: ActivityRow[] = shownActivities.map((a) => ({ ...a, level: a.level ? levelLabel(a.level) : "", status: "Approved" }));
  const doc: ReportDoc<ReportRow> = {
    title: "Schedule of Classes",
    term: `${termLabel} · ${levelLabel(level)} · ${departments.find((department) => department.id === departmentId)?.label ?? "All permitted departments"} · ${buildings.find((building) => building.id === buildingId)?.label ?? "All buildings"} · ${status === "ALL" ? "All workflow stages" : STATUS_LABELS[status]}${day === "ALL" ? "" : ` · ${day}`}${search ? ` · Search: ${search}` : ""}${issue === "ALL" ? "" : ` · ${issue === "CONFLICTS" ? "Overlaps only" : "Calendar affected only"}`}`,
    filename: "schedule-of-classes",
    landscape: true,
    rows: filtered,
    columns: [
      { header: "Subject", value: (r) => r.subjectLabel },
      { header: "Section", value: (r) => r.sectionLabel },
      { header: "Faculty", value: (r) => r.facultyLabel },
      { header: "Room", value: (r) => r.roomLabel },
      { header: "Day", value: (r) => r.dayOfWeek[0] + r.dayOfWeek.slice(1).toLowerCase() },
      { header: "Time", value: (r) => `${formatTime(r.startMin)} to ${formatTime(r.endMin)}` },
      { header: "Term", value: (r) => r.semesterLabel },
      { header: "Status", value: (r) => STATUS_LABELS[r.status] ?? r.status },
      { header: "Recurring overlap", value: (r) => conflictIds.has(r.id) ? "Review" : "None found" },
      { header: "Affected Dates", value: (r) => affectText(r.affects) || "None" },
    ],
    extra: [
      reportSection("Schedule Analytics for This Selection", [{ header: "Metric", value: (row: { metric: string; value: number | string }) => row.metric }, { header: "Value", value: (row) => row.value }], [
        { metric: "Class meetings", value: insights.total }, { metric: "Weekly teaching hours (combined weekly patterns)", value: insights.weeklyHours },
        { metric: "Published meetings", value: insights.published }, { metric: "Published share of selection", value: insights.total ? `${insights.publicationRate}%` : "No meetings" },
        { metric: "Recurring overlapping meeting pairs", value: insights.conflictPairs }, { metric: "Calendar-affected occurrences", value: insights.affectedOccurrences },
      ]),
      reportSection("Teaching Hours by Day", [{ header: "Day", value: (row: (typeof insights.daily)[number]) => row.label }, { header: "Meetings", value: (row) => row.count }, { header: "Hours", value: (row) => row.hours }], insights.daily),
      reportSection("School Activities, Holidays, and Class Suspensions", ACTIVITY_COLUMNS, activityRows),
    ],
  };

  return (
    <div className="space-y-6">
      <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
        <div className="space-y-1"><CardTitle className="flex items-center gap-2"><Funnel className="size-4 text-primary" />Build your report</CardTitle><p className="text-xs text-muted-foreground">Filters update the analytics, schedule rows, and every export together.</p></div>
        <Button type="button" variant="ghost" size="sm" onClick={reset}><ArrowCounterClockwise className="size-4" />Reset filters</Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 [&_button]:w-full">
          <FilterSelect label="Semesters" value={semesterId} onChange={setSemesterId} options={semesters} className="w-44" />
          <FilterSelect label="Departments" value={departmentId} onChange={setDepartmentId} options={departments} className="w-48" />
          <FilterSelect label="Sections" value={sectionId} onChange={setSectionId} options={sections} className="w-36" />
          <FilterSelect label="Faculty" value={facultyId} onChange={setFacultyId} options={faculty} className="w-40" />
          <FilterSelect label="Rooms" value={roomId} onChange={setRoomId} options={rooms} className="w-36" />
          <FilterSelect label="Buildings" value={buildingId} onChange={setBuildingId} options={buildings} />
          <FilterSelect label="Statuses" value={status} onChange={setStatus} options={SCHEDULE_STATES.map((state) => ({ id: state, label: SCHEDULE_STATE_LABELS[state] }))} />
          <FilterSelect label="Days" value={day} onChange={setDay} options={WEEK_DAYS.map((value) => ({ id: value, label: value[0] + value.slice(1).toLowerCase() }))} />
          <FilterSelect label="Findings" value={issue} onChange={setIssue} options={[{ id: "CONFLICTS", label: "Recurring overlaps" }, { id: "AFFECTED", label: "Calendar-affected meetings" }]} />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3"><label className="relative w-full sm:max-w-md"><MagnifyingGlass className="absolute left-3 top-2.5 size-4 text-muted-foreground" aria-hidden /><Input value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search schedule reports" placeholder="Search subject, section, faculty, or room…" className="pl-9" /></label><span className="text-xs text-muted-foreground">{levelLabel(level)} · {status === "ALL" ? "All workflow stages" : STATUS_LABELS[status]}</span></div>
        {status !== "PUBLISHED" && <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">Includes unpublished schedules. Filter by Published for official copies.</p>}
      </CardContent></Card>
      <ScheduleInsightPanel data={insights} activeDay={day} activeStatus={status} onDay={(value) => setDay((current) => current === value ? "ALL" : value)} onStatus={(value) => { setStatus((current) => current === value ? "ALL" : value); setIssue("ALL"); }} onConflicts={() => setIssue("CONFLICTS")} />
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3"><p className="text-sm"><strong>{insights.affectedMeetings}</strong> weekly meetings affected · <strong>{insights.affectedOccurrences}</strong> dated class occurrences<span className="ml-2 text-xs text-muted-foreground">Holidays, active suspensions, and approved activities</span></p><Button type="button" variant="outline" size="sm" aria-pressed={issue === "AFFECTED"} onClick={() => setIssue((value) => value === "AFFECTED" ? "ALL" : "AFFECTED")}>Inspect affected meetings</Button></div>
      <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3"><div><CardTitle>Schedule register</CardTitle><p className="mt-1 text-xs text-muted-foreground">{termLabel} · {filtered.length} matching meetings</p></div><ReportButtons doc={doc} />
      </CardHeader>
      <CardContent className="space-y-6">
        <section className="space-y-2">
          <p className="text-sm text-muted-foreground">
            {filtered.length} class{filtered.length === 1 ? "" : "es"}; {affectedCount} fall on a holiday, class suspension, or approved activity day.
          </p>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Subject</TableHead>
                  <TableHead>Section</TableHead>
                  <TableHead>Faculty</TableHead>
                  <TableHead>Room</TableHead>
                  <TableHead>Day / Time</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Affected Dates</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                      No schedule entries match the selected filters.
                    </TableCell>
                  </TableRow>
                )}
                {paging.visible.map((r) => (
                  <TableRow key={r.id} className={cn(r.affects.length > 0 && "bg-amber-500/[0.05]")}>
                    <TableCell className="font-medium">{r.subjectLabel}{conflictIds.has(r.id) && <Badge variant="outline" className="mt-1 border-amber-500/40 text-amber-800 dark:text-amber-200">Recurring overlap</Badge>}</TableCell>
                    <TableCell>{r.sectionLabel}</TableCell>
                    <TableCell>{r.facultyLabel}</TableCell>
                    <TableCell>{r.roomLabel}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {r.dayOfWeek[0] + r.dayOfWeek.slice(1).toLowerCase()} · {formatTime(r.startMin)}–{formatTime(r.endMin)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={r.status === "PUBLISHED" ? "default" : "secondary"}>{STATUS_LABELS[r.status] ?? r.status}</Badge>
                    </TableCell>
                    <TableCell className="min-w-48">
                      {r.affects.length === 0 ? (
                        <span className="text-xs text-muted-foreground">None</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {r.affects.slice(0, 3).map((a) => (
                            <Badge key={`${a.date}-${a.title}`} variant="outline" className={AFFECT_COLOR[a.type]} title={`${AFFECT_LABEL[a.type]}: ${a.title}`}>
                              {shortDate(a.date)} {AFFECT_LABEL[a.type]}
                            </Badge>
                          ))}
                          {r.affects.length > 3 && <span className="text-xs text-muted-foreground" title={affectText(r.affects)}>and {r.affects.length - 3} more</span>}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Pagination {...paging} />
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold">School Activities, Holidays, and Class Suspensions</h3>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Activity</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>School Level</TableHead>
                  <TableHead>Location</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shownActivities.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-6 text-center text-sm text-muted-foreground">No activities in this period.</TableCell>
                  </TableRow>
                )}
                {shownActivities.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="whitespace-nowrap">{a.startDate === a.endDate ? formatLongDate(a.startDate) : `${shortDate(a.startDate)} to ${formatLongDate(a.endDate)}`}</TableCell>
                    <TableCell className="font-medium">{a.title}</TableCell>
                    <TableCell><Badge variant="outline" className={AFFECT_COLOR[a.type]}>{EVENT_LABELS[a.type as keyof typeof EVENT_LABELS]}</Badge></TableCell>
                    <TableCell>{a.department || "All departments"}</TableCell>
                    <TableCell>{a.level ? levelLabel(a.level) : "All levels"}</TableCell>
                    <TableCell>{a.location || "Not set"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      </CardContent>
    </Card>
    </div>
  );
}
