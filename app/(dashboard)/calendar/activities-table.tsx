"use client";

import { Fragment, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp } from "@phosphor-icons/react/ssr";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ActionButton } from "@/components/ux/action-button";
import { NativeSelect } from "@/components/ux/native-select";
import { Pagination, usePagination } from "@/components/ux/pagination";
import { ActivitiesReportButtons } from "@/components/ux/export-buttons";
import { EmptyState } from "@/components/ux/states";
import { ACADEMIC_LEVELS, levelLabel } from "@/lib/academics/levels";
import { EVENT_LABELS, formatLongDate } from "@/lib/calendar";
import { ACTIVITY_STATUSES, ACTIVITY_STATUS_COLORS, ACTIVITY_STATUS_LABELS, type ActivityListItem } from "@/lib/activities/status";
import { formatRange } from "@/lib/scheduler/timetable";
import { cn } from "@/lib/utils";
import { ActivityDialog, activityForm, canManageActivity, type ActivityForm, type ActivityFormOptions } from "./calendar-board";

type SortKey = "date" | "title" | "time" | "department" | "level" | "location" | "status";
const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "date", label: "Date" },
  { key: "title", label: "Activity" },
  { key: "time", label: "Time" },
  { key: "department", label: "Department" },
  { key: "level", label: "School Level" },
  { key: "location", label: "Location" },
  { key: "status", label: "Status" },
];
const TYPES = ["SCHOOL_EVENT", "HOLIDAY", "CLASS_SUSPENSION"] as const;

const levelText = (a: ActivityListItem) => (a.level ? levelLabel(a.level) : "All levels");
const timeText = (a: ActivityListItem) => (a.startMin === null || a.endMin === null ? "Whole day" : formatRange(a.startMin, a.endMin));
const dateText = (a: ActivityListItem) =>
  a.startDate === a.endDate ? formatLongDate(a.startDate, { weekday: "short", month: "short", day: "numeric", year: "numeric" }) : `${formatLongDate(a.startDate, { month: "short", day: "numeric" })} to ${formatLongDate(a.endDate, { month: "short", day: "numeric", year: "numeric" })}`;

const SORT_VALUE: Record<Exclude<SortKey, "date">, (a: ActivityListItem) => string | number> = {
  title: (a) => a.title.toLowerCase(),
  time: (a) => a.startMin ?? -1,
  department: (a) => a.department,
  level: levelText,
  location: (a) => a.location,
  status: (a) => ACTIVITY_STATUS_LABELS[a.status],
};

/** Searchable, sortable list of activities; by default upcoming activities come first, earliest at the top. */
export function ActivitiesTable({
  items,
  today,
  term,
  departments,
  formOptions,
  canEdit,
  isAdmin,
  ownDepartmentId,
}: {
  items: ActivityListItem[];
  today: string;
  term: string;
  departments: { value: string; label: string }[];
  formOptions: ActivityFormOptions;
  canEdit: boolean;
  isAdmin: boolean;
  ownDepartmentId: string | null;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [department, setDepartment] = useState("");
  const [level, setLevel] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({ key: "date", asc: true });
  const [editing, setEditing] = useState<{ id?: string; form: ActivityForm } | null>(null);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = items.filter(
      (a) =>
        (!from || a.endDate >= from) &&
        (!to || a.startDate <= to) &&
        (!department || (department === "ALL" ? !a.departmentId : a.departmentId === department)) &&
        (!level || a.level === level) &&
        (!type || a.type === type) &&
        (!status || a.status === status) &&
        (!q || [a.title, a.description, a.location, a.participants, a.department, a.submittedBy].some((v) => v.toLowerCase().includes(q))),
    );
    const dir = sort.asc ? 1 : -1;
    if (sort.key === "date") {
      // Upcoming and ongoing first (earliest first), then past activities (most recent first).
      const upcoming = (a: ActivityListItem) => a.endDate >= today;
      return filtered.sort(
        (a, b) =>
          Number(upcoming(b)) - Number(upcoming(a)) ||
          (upcoming(a) ? 1 : -1) * dir * (a.startDate.localeCompare(b.startDate) || (a.startMin ?? -1) - (b.startMin ?? -1)),
      );
    }
    const value = SORT_VALUE[sort.key];
    return filtered.sort((a, b) => {
      const x = value(a);
      const y = value(b);
      return dir * (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))) || a.startDate.localeCompare(b.startDate);
    });
  }, [items, query, from, to, department, level, type, status, sort, today]);

  const paging = usePagination(rows, 20, [query, from, to, department, level, type, status, sort.key, sort.asc].join("|"));
  const toggleSort = (key: SortKey) => setSort((s) => ({ key, asc: s.key === key ? !s.asc : true }));
  const clear = () => [setQuery, setFrom, setTo, setDepartment, setLevel, setType, setStatus].forEach((f) => f(""));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search activities" aria-label="Search activities" className="h-9 w-full sm:w-60" />
        <label className="flex flex-col text-xs text-muted-foreground">
          From
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-40" />
        </label>
        <label className="flex flex-col text-xs text-muted-foreground">
          To
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-40" />
        </label>
        <NativeSelect aria-label="Department" value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="Every department" options={[{ value: "ALL", label: "Institution-wide only" }, ...departments]} className="w-full sm:w-56" />
        <NativeSelect aria-label="School level" value={level} onChange={(e) => setLevel(e.target.value)} placeholder="Every school level" options={ACADEMIC_LEVELS.map((l) => ({ value: l, label: levelLabel(l) }))} className="w-full sm:w-48" />
        <NativeSelect aria-label="Activity type" value={type} onChange={(e) => setType(e.target.value)} placeholder="Every type" options={TYPES.map((t) => ({ value: t, label: EVENT_LABELS[t] }))} className="w-full sm:w-44" />
        <NativeSelect aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)} placeholder="Every status" options={ACTIVITY_STATUSES.map((s) => ({ value: s, label: ACTIVITY_STATUS_LABELS[s] }))} className="w-full sm:w-44" />
        <button onClick={clear} className="h-9 px-2 text-sm text-muted-foreground underline-offset-2 hover:underline">Clear filters</button>
        <div className="ml-auto">
          <ActivitiesReportButtons
            title="School Activities"
            term={term}
            filename={`school-activities-${today}`}
            rows={rows.map((a) => ({ ...a, level: a.level ? levelLabel(a.level) : "", status: ACTIVITY_STATUS_LABELS[a.status] }))}
          />
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No activities" description={items.length ? "Nothing matches these filters." : "School events, holidays, and class suspensions appear here."} />
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                {COLUMNS.map((c) => (
                  <TableHead key={c.key} aria-sort={sort.key === c.key ? (sort.asc ? "ascending" : "descending") : "none"}>
                    <button onClick={() => toggleSort(c.key)} className="flex items-center gap-1 font-medium">
                      {c.label}
                      {sort.key === c.key && (sort.asc ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
                    </button>
                  </TableHead>
                ))}
                {canEdit && <TableHead><span className="sr-only">Actions</span></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {paging.visible.map((a, i) => {
                const prev = paging.visible[i - 1];
                const firstPast = sort.key === "date" && a.endDate < today && (!prev || prev.endDate >= today);
                return (
                  <Fragment key={a.id}>
                    {firstPast && (
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableCell colSpan={COLUMNS.length + (canEdit ? 1 : 0)} className="text-xs font-semibold text-muted-foreground">Past activities</TableCell>
                      </TableRow>
                    )}
                    <TableRow className={cn(a.status !== "APPROVED" && "bg-amber-500/[0.04]")}>
                      <TableCell className="whitespace-nowrap">{dateText(a)}</TableCell>
                      <TableCell>
                        <span className="font-medium">{a.title}</span>
                        <span className="block text-xs text-muted-foreground">{EVENT_LABELS[a.type as keyof typeof EVENT_LABELS]}</span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{timeText(a)}</TableCell>
                      <TableCell>{a.department}</TableCell>
                      <TableCell>{levelText(a)}</TableCell>
                      <TableCell>{a.location || "Not set"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={ACTIVITY_STATUS_COLORS[a.status]}>{ACTIVITY_STATUS_LABELS[a.status]}</Badge>
                        {a.reviewNote && <span className="mt-0.5 block max-w-56 text-xs text-muted-foreground">{a.reviewNote}</span>}
                      </TableCell>
                      {canEdit && (
                        <TableCell className="text-right">
                          {canManageActivity(a, isAdmin, ownDepartmentId) && <ActionButton kind="edit" onClick={() => setEditing({ id: a.id, form: activityForm(a) })} />}
                        </TableCell>
                      )}
                    </TableRow>
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      <Pagination {...paging} />
      <ActivityDialog state={editing} isAdmin={isAdmin} options={formOptions} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); router.refresh(); }} />
    </div>
  );
}
