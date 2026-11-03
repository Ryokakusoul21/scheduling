"use client";

import Link from "next/link";
import { Lock } from "@phosphor-icons/react/ssr";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { FacultyPopover } from "./faculty-popover";
import type { CurriculumRow, SubjectRequestInfo } from "./types";

export const COLUMNS = [
  { key: "category", label: "Category" },
  { key: "units", label: "Units" },
  { key: "hours", label: "Hours" },
  { key: "faculty", label: "Assigned faculty" },
  { key: "request", label: "Request" },
] as const;
export type ColumnKey = (typeof COLUMNS)[number]["key"];

const REQUEST_STYLE: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100",
  APPROVED: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100",
  REJECTED: "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-100",
  COMPLETED: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100",
  CANCELLED: "bg-slate-200 text-slate-900 dark:bg-slate-700 dark:text-slate-100",
};

/** Pending, Approved or Rejected badge that links to the request in Schedule Requests. */
export function RequestBadge({ request, code }: { request: SubjectRequestInfo | null; code: string }) {
  if (!request) return null;
  const word = request.status[0] + request.status.slice(1).toLowerCase();
  return (
    <Link href="/requests" aria-label={`${code} change request ${word.toLowerCase()}. Open Schedule Requests.`} className="inline-flex rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <Badge variant="secondary" className={REQUEST_STYLE[request.status]}>Request {word.toLowerCase()}</Badge>
    </Link>
  );
}

/** One category badge; ownership and sharing sit on a quiet second line instead of extra pills. */
function Secondary({ row }: { row: CurriculumRow }) {
  const shared = row.sharedPrograms.length > 1 ? `Shared: ${row.sharedPrograms.map((p) => p.code).join(", ")}` : null;
  return (
    <>
      {(!row.editable || shared) && (
        <span className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground" title={row.sharedPrograms.map((p) => p.name).join(", ")}>
          {!row.editable && <span className="flex items-center gap-1"><Lock className="size-3.5 shrink-0" aria-hidden /> {row.departmentName ? `Managed by ${row.departmentName}` : "Read-only"}</span>}
          {shared}
        </span>
      )}
    </>
  );
}

const CategoryBadge = ({ row }: { row: CurriculumRow }) => <Badge variant={row.category === "MAJOR" ? "default" : "secondary"}>{row.category === "MAJOR" ? "Major" : "Minor / General Education"}</Badge>;

function Faculty({ row, onView, hasContext }: { row: CurriculumRow; onView: (row: CurriculumRow) => void; hasContext: boolean }) {
  if (!hasContext) return null;
  if (!row.assignments.length) return <Badge variant="outline" className="border-amber-600/50 bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-100">Unassigned</Badge>;
  return <FacultyPopover assignments={row.assignments} hours={row.lectureHours + row.labHours} onView={() => onView(row)} />;
}

type Shared = {
  rows: CurriculumRow[];
  selected: Set<string>;
  onSelect: (id: string, on: boolean) => void;
  actions: (row: CurriculumRow) => React.ReactNode;
  onView: (row: CurriculumRow) => void;
  hasContext: boolean;
};

const rowTone = (row: CurriculumRow, hasContext: boolean) =>
  hasContext && !row.assignments.length ? "border-l-4 border-l-amber-500" : !row.editable ? "border-l-4 border-l-transparent bg-muted/30" : "border-l-4 border-l-transparent";

/** Table with a sticky header and sticky checkbox and code columns for horizontal scrolling. */
export function SubjectsTable({ rows, selected, onSelect, onSelectAll, actions, onView, hasContext, visible }: Shared & { onSelectAll: (on: boolean) => void; visible: Set<ColumnKey> }) {
  const selectable = rows.filter((r) => r.editable);
  const all = selectable.length > 0 && selectable.every((r) => selected.has(r.id));
  const th = "h-11 px-3 text-left text-sm font-medium text-muted-foreground";
  return (
    <div className="max-h-[65vh] overflow-auto">
      <table className="w-full min-w-[820px] border-separate border-spacing-0 text-sm">
        <thead className="sticky top-0 z-20 bg-card">
          <tr className="border-b">
            <th className={cn(th, "sticky left-0 z-30 w-12 bg-card border-b")}>
              <Checkbox aria-label="Select all subjects you can manage on this page" checked={all} disabled={!selectable.length} onCheckedChange={(on) => onSelectAll(!!on)} />
            </th>
            <th className={cn(th, "sticky left-12 z-30 bg-card border-b")}>Code</th>
            <th className={cn(th, "border-b")}>Subject</th>
            {visible.has("category") && <th className={cn(th, "border-b")}>Category</th>}
            {visible.has("units") && <th className={cn(th, "border-b text-right")}>Units</th>}
            {visible.has("hours") && <th className={cn(th, "border-b text-right")}>Hours</th>}
            {hasContext && visible.has("faculty") && <th className={cn(th, "border-b")}>Assigned faculty</th>}
            {visible.has("request") && <th className={cn(th, "border-b")}>Request</th>}
            <th className={cn(th, "border-b")}><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const bg = r.editable ? "bg-card" : "bg-muted";
            return (
              <tr key={r.id} className="group hover:bg-muted/40" data-state={selected.has(r.id) ? "selected" : undefined}>
                <td className={cn("sticky left-0 z-10 border-b px-3 py-2", bg, rowTone(r, hasContext))}>
                  {r.editable && <Checkbox aria-label={`Select ${r.code}`} checked={selected.has(r.id)} onCheckedChange={(on) => onSelect(r.id, !!on)} />}
                </td>
                <td className={cn("sticky left-12 z-10 whitespace-nowrap border-b px-3 py-2 font-medium", bg)}>{r.code}</td>
                <td className={cn("border-b px-3 py-2", !r.editable && "bg-muted/30")}>
                  <span className="block text-base font-medium md:text-sm">{r.name}</span>
                  <Secondary row={r} />
                </td>
                {visible.has("category") && <td className="border-b px-3 py-2"><CategoryBadge row={r} /></td>}
                {visible.has("units") && <td className="border-b px-3 py-2 text-right tabular-nums">{r.units}</td>}
                {visible.has("hours") && <td className="border-b px-3 py-2 text-right tabular-nums">{r.lectureHours + r.labHours}</td>}
                {hasContext && visible.has("faculty") && <td className="border-b px-3 py-2"><Faculty row={r} onView={onView} hasContext={hasContext} /></td>}
                {visible.has("request") && <td className="border-b px-3 py-2"><RequestBadge request={r.request} code={r.code} /></td>}
                <td className="border-b px-3 py-2">{actions(r)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Card layout: the chosen view on any screen, and the layout used on phones. */
export function SubjectCards({ rows, selected, onSelect, actions, onView, hasContext }: Shared) {
  return (
    <ul className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
      {rows.map((r) => (
        <li key={r.id} className={cn("flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-xs", rowTone(r, hasContext), !r.editable && "bg-muted/40")}>
          <div className="flex items-start gap-3">
            {r.editable && <Checkbox className="mt-1" aria-label={`Select ${r.code}`} checked={selected.has(r.id)} onCheckedChange={(on) => onSelect(r.id, !!on)} />}
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{r.code}</p>
              <p className="text-base md:text-sm">{r.name}</p>
              <Secondary row={r} />
            </div>
            <CategoryBadge row={r} />
          </div>
          <p className="text-sm text-muted-foreground">{r.units} units · {r.lectureHours + r.labHours} hrs/week</p>
          <div className="flex flex-wrap items-center gap-2">
            <Faculty row={r} onView={onView} hasContext={hasContext} />
            <RequestBadge request={r.request} code={r.code} />
          </div>
          <div className="mt-auto">{actions(r)}</div>
        </li>
      ))}
    </ul>
  );
}
