"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ReportButtons } from "@/components/ux/export-buttons";
import { Pagination, usePagination } from "@/components/ux/pagination";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ACADEMIC_LEVELS, levelLabel } from "@/lib/academics/levels";
import { EVENT_LABELS, formatLongDate } from "@/lib/calendar";
import { ACTIVITY_COLUMNS, reportSection, type ActivityRow, type ReportDoc } from "@/lib/export/report";
import { affectsOf, type Affect, type ReportActivity } from "@/lib/reports/affected";

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

const LEVEL_OPTIONS = ACADEMIC_LEVELS.map((l) => ({ id: l, label: levelLabel(l) }));

export function ScheduleReportTable({
  rows,
  activities,
  semesters,
  departments,
  sections,
  faculty,
  rooms,
}: {
  rows: Row[];
  activities: Activity[];
  semesters: (Option & { start: string; end: string })[];
  departments: Option[];
  sections: Option[];
  faculty: Option[];
  rooms: Option[];
}) {
  const [semesterId, setSemesterId] = useState("ALL");
  const [departmentId, setDepartmentId] = useState("ALL");
  const [level, setLevel] = useState("ALL");
  const [sectionId, setSectionId] = useState("ALL");
  const [facultyId, setFacultyId] = useState("ALL");
  const [roomId, setRoomId] = useState("ALL");
  const pick = (v: string, id: string | null) => v === "ALL" || v === id;

  const filtered = useMemo(
    () =>
      rows
        .filter(
          (r) =>
            pick(semesterId, r.semesterId) && pick(departmentId, r.departmentId) && pick(level, r.level) &&
            pick(sectionId, r.sectionId) && pick(facultyId, r.facultyId) && pick(roomId, r.roomId),
        )
        .map((r): ReportRow => ({ ...r, affects: affectsOf(r, activities) })),
    [rows, activities, semesterId, departmentId, level, sectionId, facultyId, roomId],
  );

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
  const paging = usePagination(filtered, 10, [semesterId, departmentId, level, sectionId, facultyId, roomId].join("|"));
  const termLabel = semesters.find((s) => s.id === semesterId)?.label ?? "All semesters";

  const activityRows: ActivityRow[] = shownActivities.map((a) => ({ ...a, level: a.level ? levelLabel(a.level) : "", status: "Approved" }));
  const doc: ReportDoc<ReportRow> = {
    title: "Schedule of Classes",
    term: termLabel,
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
      { header: "Affected Dates", value: (r) => affectText(r.affects) || "None" },
    ],
    extra: [reportSection("School Activities, Holidays, and Class Suspensions", ACTIVITY_COLUMNS, activityRows)],
  };

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
        <CardTitle>Class Schedule Report</CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <FilterSelect label="Semesters" value={semesterId} onChange={setSemesterId} options={semesters} className="w-44" />
          <FilterSelect label="Departments" value={departmentId} onChange={setDepartmentId} options={departments} className="w-48" />
          <FilterSelect label="School Levels" value={level} onChange={setLevel} options={LEVEL_OPTIONS} className="w-44" />
          <FilterSelect label="Sections" value={sectionId} onChange={setSectionId} options={sections} className="w-36" />
          <FilterSelect label="Faculty" value={facultyId} onChange={setFacultyId} options={faculty} className="w-40" />
          <FilterSelect label="Rooms" value={roomId} onChange={setRoomId} options={rooms} className="w-36" />
          <ReportButtons doc={doc} />
        </div>
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
                    <TableCell className="font-medium">{r.subjectLabel}</TableCell>
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
  );
}
