"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NativeSelect } from "@/components/ux/native-select";
import { Pagination, usePagination } from "@/components/ux/pagination";
import { ActivitiesReportButtons } from "@/components/ux/export-buttons";
import { EmptyState } from "@/components/ux/states";
import { ACADEMIC_LEVELS, levelLabel } from "@/lib/academics/levels";
import { EVENT_COLORS, EVENT_LABELS, formatLongDate } from "@/lib/calendar";
import { ACTIVITY_STATUSES, ACTIVITY_STATUS_COLORS, ACTIVITY_STATUS_LABELS, type ActivityListItem } from "@/lib/activities/status";
import { formatRange } from "@/lib/scheduler/timetable";
import { cn } from "@/lib/utils";
import { ActivityDialog, activityForm, canManageActivity, type ActivityForm, type ActivityFormOptions } from "./calendar-board";

const TYPES = ["SCHOOL_EVENT", "HOLIDAY", "CLASS_SUSPENSION"] as const;
const typeLabel = (a: ActivityListItem) => EVENT_LABELS[a.type as keyof typeof EVENT_LABELS];
const timeText = (a: ActivityListItem) => (a.startMin === null || a.endMin === null ? "Whole day" : formatRange(a.startMin, a.endMin));
const monthOf = (iso: string) => formatLongDate(iso, { month: "long", year: "numeric" });

/** One date format everywhere: "Nov 12 to 16, 2026" or "Mon, Nov 30, 2026". */
function dateText(a: ActivityListItem) {
  if (a.startDate === a.endDate) return formatLongDate(a.startDate, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  const sameMonth = a.startDate.slice(0, 7) === a.endDate.slice(0, 7);
  return `${formatLongDate(a.startDate, { month: "short", day: "numeric" })} to ${formatLongDate(a.endDate, sameMonth ? { day: "numeric", year: "numeric" } : { month: "short", day: "numeric", year: "numeric" })}`;
}

/** Only specific values are shown; "all" and "not set" add noise. */
function scopeText(a: ActivityListItem) {
  return [a.departmentId ? a.department : "", a.level ? levelLabel(a.level) : ""].filter(Boolean).join(" · ");
}

/** Agenda of activities: items needing action first, then upcoming by month, with past activities collapsed. */
export function ActivitiesTable({ items, today, term, departments, formOptions, canEdit, isAdmin, ownDepartmentId }: {
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
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [department, setDepartment] = useState("");
  const [level, setLevel] = useState("");
  const [type, setType] = useState("");
  const [showPast, setShowPast] = useState(false);
  const [detail, setDetail] = useState<ActivityListItem | null>(null);
  const [editing, setEditing] = useState<{ id?: string; form: ActivityForm } | null>(null);

  const needsAction = (a: ActivityListItem) => a.status !== "APPROVED" && canManageActivity(a, isAdmin, ownDepartmentId);
  const counts = useMemo(() => ({
    action: items.filter(needsAction).length,
    pending: items.filter((a) => a.status === "PENDING").length,
    soon: items.filter((a) => a.endDate >= today && a.startDate <= new Date(Date.parse(`${today}T00:00:00Z`) + 30 * 864e5).toISOString().slice(0, 10)).length,
  }), [items, today]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((a) =>
      (!status || a.status === status) && (!from || a.endDate >= from) && (!to || a.startDate <= to) &&
      (!department || (department === "ALL" ? !a.departmentId : a.departmentId === department)) && (!level || a.level === level) && (!type || a.type === type) &&
      (!q || [a.title, a.description, a.location, a.participants, a.department, a.submittedBy].some((v) => v.toLowerCase().includes(q))));
  }, [items, query, status, from, to, department, level, type]);

  const action = filtered.filter(needsAction).sort((a, b) => a.startDate.localeCompare(b.startDate));
  const rest = filtered.filter((a) => !needsAction(a));
  const upcoming = rest.filter((a) => a.endDate >= today).sort((a, b) => a.startDate.localeCompare(b.startDate) || (a.startMin ?? -1) - (b.startMin ?? -1));
  const past = rest.filter((a) => a.endDate < today).sort((a, b) => b.startDate.localeCompare(a.startDate));
  const paging = usePagination(upcoming, 20, [query, status, from, to, department, level, type].join("|"));
  const filters = [from, to, department, level, type].filter(Boolean).length;
  const clear = () => [setQuery, setStatus, setFrom, setTo, setDepartment, setLevel, setType].forEach((f) => f(""));

  const row = (a: ActivityListItem) => (
    <li key={a.id}>
      <button type="button" onClick={() => setDetail(a)} className={cn("grid w-full gap-x-4 gap-y-1 px-4 py-3 text-left hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring md:grid-cols-[11rem_minmax(0,1fr)_14rem_8.5rem] md:items-center", a.status !== "APPROVED" && "bg-amber-500/[0.04]")}>
        <span className="text-sm tabular-nums text-muted-foreground">{dateText(a)}</span>
        <span className="min-w-0">
          <span className="block truncate font-medium">{a.title}</span>
          <span className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className={EVENT_COLORS[a.type as keyof typeof EVENT_COLORS]}>{typeLabel(a)}</Badge>
            {scopeText(a) && <span className="text-xs text-muted-foreground">{scopeText(a)}</span>}
          </span>
        </span>
        <span className="text-sm">{timeText(a)}{a.location && <span className="block text-xs text-muted-foreground">{a.location}</span>}</span>
        <span><Badge variant="outline" className={ACTIVITY_STATUS_COLORS[a.status]}>{ACTIVITY_STATUS_LABELS[a.status]}</Badge></span>
      </button>
    </li>
  );

  const section = (title: string, list: ActivityListItem[], tone?: string) => list.length > 0 && (
    <div key={title}>
      <h3 className={cn("border-b bg-muted/40 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground", tone)}>{title}</h3>
      <ul className="divide-y">{list.map(row)}</ul>
    </div>
  );
  const months = paging.visible.reduce<[string, ActivityListItem[]][]>((groups, a) => {
    const key = monthOf(a.startDate);
    (groups.at(-1)?.[0] === key ? groups.at(-1)![1] : groups[groups.push([key, []]) - 1][1]).push(a);
    return groups;
  }, []);

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-3">
        {[{ label: "Needs your action", value: counts.action, hint: "Changes requested or awaiting review" }, { label: "Pending", value: counts.pending, hint: "Not yet on the school calendar" }, { label: "Next 30 days", value: counts.soon, hint: "Starting or ongoing" }].map((c) => (
          <div key={c.label} className="rounded-lg border bg-card px-4 py-3"><p className="text-xs text-muted-foreground">{c.label}</p><p className="text-2xl font-semibold tabular-nums">{c.value}</p><p className="text-xs text-muted-foreground">{c.hint}</p></div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search activities" aria-label="Search activities" className="h-9 w-full sm:w-64" />
        <div role="group" aria-label="Status" className="flex flex-wrap gap-1">
          {[{ value: "", label: "All" }, ...ACTIVITY_STATUSES.map((s) => ({ value: s, label: ACTIVITY_STATUS_LABELS[s] }))].map((s) => (
            <button key={s.value} type="button" aria-pressed={status === s.value} onClick={() => setStatus(s.value)} className={cn("rounded-full border px-3 py-1 text-xs font-medium", status === s.value ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>
              {s.label}<span className="ml-1.5 tabular-nums opacity-70">{s.value ? items.filter((a) => a.status === s.value).length : items.length}</span>
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <details className="relative">
            <summary className="flex h-9 cursor-pointer list-none items-center rounded-md border px-3 text-sm font-medium hover:bg-muted">Filters{filters > 0 && <Badge className="ml-2">{filters}</Badge>}</summary>
            <div className="absolute right-0 z-20 mt-1 grid w-72 gap-2 rounded-lg border bg-popover p-3 shadow-md">
              <label className="text-xs text-muted-foreground">From<Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9" /></label>
              <label className="text-xs text-muted-foreground">To<Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9" /></label>
              <NativeSelect aria-label="Department" value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="Every department" options={[{ value: "ALL", label: "Institution-wide only" }, ...departments]} />
              <NativeSelect aria-label="School level" value={level} onChange={(e) => setLevel(e.target.value)} placeholder="Every school level" options={ACADEMIC_LEVELS.map((l) => ({ value: l, label: levelLabel(l) }))} />
              <NativeSelect aria-label="Activity type" value={type} onChange={(e) => setType(e.target.value)} placeholder="Every type" options={TYPES.map((t) => ({ value: t, label: EVENT_LABELS[t] }))} />
              <button type="button" onClick={clear} className="text-left text-sm text-primary hover:underline">Clear all filters</button>
            </div>
          </details>
          <details className="relative">
            <summary className="flex h-9 cursor-pointer list-none items-center rounded-md border px-3 text-sm font-medium hover:bg-muted">Export</summary>
            <div className="absolute right-0 z-20 mt-1 rounded-lg border bg-popover p-3 shadow-md">
              <ActivitiesReportButtons title="School Activities" term={term} filename={`school-activities-${today}`} official
                department={department && department !== "ALL" ? departments.find((option) => option.value === department)?.label ?? "All Departments" : "All Departments"}
                rows={filtered.map((a) => ({ ...a, level: a.level ? levelLabel(a.level) : "", status: ACTIVITY_STATUS_LABELS[a.status] }))} />
            </div>
          </details>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No activities" description={items.length ? "Nothing matches these filters." : "School events, holidays, and class suspensions appear here."} />
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card">
          {section("Needs your action", action, "text-amber-800 dark:text-amber-200")}
          {months.map(([month, list]) => section(month, list))}
          {past.length > 0 && (
            <div>
              <button type="button" onClick={() => setShowPast((v) => !v)} aria-expanded={showPast} className="w-full border-t bg-muted/40 px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:bg-muted">
                {showPast ? "Hide" : "Show"} past activities ({past.length})
              </button>
              {showPast && <ul className="divide-y">{past.map(row)}</ul>}
            </div>
          )}
        </div>
      )}
      <Pagination {...paging} />

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="sm:max-w-md">
          {detail && (
            <>
              <DialogHeader><DialogTitle>{detail.title}</DialogTitle></DialogHeader>
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="outline" className={EVENT_COLORS[detail.type as keyof typeof EVENT_COLORS]}>{typeLabel(detail)}</Badge>
                <Badge variant="outline" className={ACTIVITY_STATUS_COLORS[detail.status]}>{ACTIVITY_STATUS_LABELS[detail.status]}</Badge>
              </div>
              <dl className="grid grid-cols-[6.5rem_1fr] gap-x-3 gap-y-2 text-sm">
                <dt className="text-muted-foreground">Date</dt><dd>{dateText(detail)}</dd>
                <dt className="text-muted-foreground">Time</dt><dd>{timeText(detail)}</dd>
                <dt className="text-muted-foreground">Location</dt><dd>{detail.location || "Not set"}</dd>
                <dt className="text-muted-foreground">Department</dt><dd>{detail.department}</dd>
                <dt className="text-muted-foreground">School level</dt><dd>{detail.level ? levelLabel(detail.level) : "All levels"}</dd>
                {detail.participants && <><dt className="text-muted-foreground">Participants</dt><dd>{detail.participants}</dd></>}
                {detail.description && <><dt className="text-muted-foreground">Description</dt><dd className="whitespace-pre-line">{detail.description}</dd></>}
                {detail.submittedBy && <><dt className="text-muted-foreground">Submitted by</dt><dd>{detail.submittedBy}</dd></>}
              </dl>
              {detail.reviewNote && <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm"><strong>Review note:</strong> {detail.reviewNote}</div>}
              {canEdit && canManageActivity(detail, isAdmin, ownDepartmentId) && (
                <Button onClick={() => { setEditing({ id: detail.id, form: activityForm(detail) }); setDetail(null); }}>Edit activity</Button>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
      <ActivityDialog state={editing} isAdmin={isAdmin} options={formOptions} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); router.refresh(); }} />
    </div>
  );
}
