"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Columns, Plus, Rows, SquaresFour } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ArchiveButton } from "@/components/ux/archive-button";
import { FormDialog, useDialogState, type FormField } from "@/components/ux/form-dialog";
import { EmptyState } from "@/components/ux/states";
import { NativeSelect } from "@/components/ux/native-select";
import { usePersisted } from "@/hooks/use-persisted";
import { attentionReason, matchesStatus, STATUS_LABELS, type StatusFilter } from "@/lib/subjects/status";
import { saveSubjectAction } from "./actions";
import { AssignFacultyModal } from "./assign-faculty-modal";
import { BulkBar } from "./bulk-bar";
import { RequestChangeModal } from "./request-change-modal";
import { SubjectRowActions, type RowAction } from "./subject-row-actions";
import { SubjectCards, SubjectsTable, COLUMNS, type ColumnKey } from "./subjects-table";
import { SORTS, SubjectsToolbar, type FilterChip } from "./subjects-toolbar";
import { SummaryCards } from "./summary-cards";
import { ViewAssignedPanel } from "./view-assigned-panel";
import type { AssignContext, CurriculumRow } from "./types";

const PAGE_SIZES = [10, 25, 50];
const CATEGORY_LABEL: Record<string, string> = { MAJOR: "Major", MINOR: "Minor / General Education", JOINED: "Shared by programs" };

export function CurriculumList({ heading, context, subjects, category, owner, allSemesters, status, canCreate, programOptions, assign, otherLevelsHref }: {
  heading: string; context: { level: string; programId: string; yearLevel: string; gradeLevel: string }; subjects: CurriculumRow[];
  category: string; owner: string; allSemesters: boolean; status: StatusFilter; canCreate: boolean; programOptions: { value: string; label: string }[];
  assign: AssignContext | null; otherLevelsHref: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const dialog = useDialogState<CurriculumRow>();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("code");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [view, setView] = usePersisted<"table" | "cards">("subjects:view", "table");
  const [hidden, setHidden] = usePersisted<ColumnKey[]>("subjects:hidden-columns", []);
  const [assigning, setAssigning] = useState<string[] | null>(null);
  const [viewing, setViewing] = useState<CurriculumRow | null>(null);
  const [requesting, setRequesting] = useState<{ row: CurriculumRow; assignment: boolean } | null>(null);
  const [archiving, setArchiving] = useState<CurriculumRow | null>(null);

  const people = useMemo(() => new Map((assign?.faculty ?? []).map((f) => [f.id, { load: f.load, limit: f.limit, unavailability: f.unavailability }])), [assign]);
  const hasContext = !!assign;
  const visible = new Set(COLUMNS.map((c) => c.key).filter((k) => !hidden.includes(k) && (hasContext || k !== "faculty")));

  function update(patch: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams.toString());
    Object.entries(patch).forEach(([key, value]) => (value ? next.set(key, value) : next.delete(key)));
    setPage(0);
    router.replace(`${pathname}?${next}`);
  }
  const allowCreate = canCreate && category !== "MINOR";
  const disabledReason = "Only the department that owns this curriculum category can add or import subjects.";

  const counts = useMemo(() => {
    const assigned = subjects.filter((s) => s.assignments.length).length;
    return {
      total: subjects.length, units: subjects.reduce((n, s) => n + s.units, 0), assigned, unassigned: subjects.length - assigned,
      attention: subjects.filter((s) => attentionReason(s, people) !== null).length,
    };
  }, [subjects, people]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const hours = (s: CurriculumRow) => s.lectureHours + s.labHours;
    return subjects
      .filter((s) => matchesStatus(status, s, people) && (!q || `${s.code} ${s.name}`.toLowerCase().includes(q)))
      .sort((a, b) =>
        sort === "title" ? a.name.localeCompare(b.name)
        : sort === "units" ? a.units - b.units
        : sort === "hours" ? hours(a) - hours(b)
        : sort === "unassigned" ? Number(!!a.assignments.length) - Number(!!b.assignments.length) || a.code.localeCompare(b.code)
        : a.code.localeCompare(b.code));
  }, [subjects, query, sort, status, people]);

  const pageCount = Math.max(1, Math.ceil(shown.length / pageSize));
  const pageIndex = Math.min(page, pageCount - 1);
  const pageRows = shown.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize);
  const chosen = subjects.filter((s) => selected.has(s.id));
  const editing = dialog.state?.mode === "edit" ? dialog.state.item : null;

  const chips: FilterChip[] = [
    ...(category !== "ALL" ? [{ key: "category", label: `Category: ${CATEGORY_LABEL[category] ?? category}`, onRemove: () => update({ category: null }) }] : []),
    ...(status !== "ALL" ? [{ key: "status", label: `Status: ${STATUS_LABELS[status]}`, onRemove: () => update({ status: null }) }] : []),
    ...(owner === "ME" ? [{ key: "owner", label: "My department only", onRemove: () => update({ owner: null }) }] : []),
    ...(allSemesters ? [{ key: "semester", label: "Every semester", onRemove: () => update({ semester: null }) }] : []),
    ...(query ? [{ key: "query", label: `Search: ${query}`, onRemove: () => setQuery("") }] : []),
  ];

  const toggle = (id: string, on: boolean) => setSelected((prev) => { const next = new Set(prev); if (on) next.add(id); else next.delete(id); return next; });
  const selectPage = (on: boolean) => setSelected((prev) => { const next = new Set(prev); pageRows.filter((r) => r.editable).forEach((r) => (on ? next.add(r.id) : next.delete(r.id))); return next; });
  const refresh = () => { setSelected(new Set()); router.refresh(); };

  function act(action: RowAction, row: CurriculumRow) {
    if (action === "assign") setAssigning([row.id]);
    else if (action === "request-assignment") setRequesting({ row, assignment: true });
    else if (action === "request-change") setRequesting({ row, assignment: false });
    else if (action === "edit") dialog.openEdit(row);
    else if (action === "archive") setArchiving(row);
    else setViewing(row);
  }
  const actions = (row: CurriculumRow) => <SubjectRowActions row={row} canAssign={hasContext} onAction={act} />;

  const fields: FormField[] = [
    { name: "level", label: "", type: "hidden" }, { name: "programId", label: "Program", type: "select", required: true, options: programOptions },
    { name: "yearLevel", label: "Year level", type: "hidden" }, { name: "code", label: "Subject code", type: "text", required: true },
    { name: "name", label: "Subject title", type: "text", required: true }, { name: "category", label: "Category", type: "select", options: [{ value: "MAJOR", label: "Major" }, { value: "MINOR", label: "Minor / General Education" }] },
    { name: "semester", label: "Semester", type: "select", options: [{ value: "FIRST", label: "1st Semester" }, { value: "SECOND", label: "2nd Semester" }, { value: "SUMMER", label: "Midyear" }] },
    { name: "units", label: "Units", type: "number", required: true, min: 0, step: "0.5" }, { name: "lectureHours", label: "Lecture hours per week", type: "number", required: true, min: 0, step: "0.5" },
    { name: "labHours", label: "Laboratory hours per week", type: "number", required: true, min: 0, step: "0.5" }, { name: "requiredRoomType", label: "Room needed", type: "hidden" },
    { name: "description", label: "Description", type: "textarea", wide: true },
  ];

  const emptyTitle = status === "UNASSIGNED" ? "No unassigned subjects. Nice work!" : status === "ATTENTION" ? "Nothing needs attention right now" : "No subjects match these filters";
  const sharedProps = { rows: pageRows, selected, onSelect: toggle, actions, onView: setViewing, hasContext };

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {hasContext && (
          <SummaryCards cards={[
            { key: "total", label: "Total subjects", value: counts.total, active: status === "ALL", onClick: () => update({ status: null }) },
            { key: "units", label: "Total units", value: counts.units },
            { key: "assigned", label: "Assigned", value: counts.assigned, active: status === "ASSIGNED", onClick: () => update({ status: "ASSIGNED" }) },
            { key: "unassigned", label: "Unassigned", value: counts.unassigned, tone: "warn", active: status === "UNASSIGNED", onClick: () => update({ status: "UNASSIGNED" }) },
            { key: "attention", label: "Needs attention", value: counts.attention, tone: "warn", active: status === "ATTENTION", onClick: () => update({ status: "ATTENTION" }) },
          ]} />
        )}

        <Card className="overflow-hidden">
          <div className="space-y-3 border-b p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{heading}</h2>
                <p aria-live="polite" className="text-sm text-muted-foreground">{shown.length} of {subjects.length} subjects shown</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Tooltip><TooltipTrigger render={<span className="inline-flex" />}><Button variant="outline" disabled={!allowCreate} nativeButton={!allowCreate} render={allowCreate ? <Link href="/import?kind=subjects" /> : undefined}>Import subjects in bulk</Button></TooltipTrigger>{!allowCreate && <TooltipContent>{disabledReason}</TooltipContent>}</Tooltip>
                <Tooltip><TooltipTrigger render={<span className="inline-flex" />}><Button disabled={!allowCreate} onClick={dialog.openCreate}><Plus className="size-4" /> Add subject</Button></TooltipTrigger>{!allowCreate && <TooltipContent>{disabledReason}</TooltipContent>}</Tooltip>
              </div>
            </div>
            <SubjectsToolbar
              query={query} onQuery={(v) => { setQuery(v); setPage(0); }}
              terms={assign?.terms ?? []} termId={assign?.term.id ?? null} onTerm={(id) => update({ term: id, semester: allSemesters ? "ALL" : null })}
              category={category} onCategory={(v) => update({ category: v === "ALL" ? null : v })}
              status={status} onStatus={(v) => update({ status: v === "ALL" ? null : v })}
              sort={sort} onSort={(v) => setSort(SORTS.some((s) => s.value === v) ? v : "code")}
              mineOnly={owner === "ME"} onMineOnly={(on) => update({ owner: on ? "ME" : null })}
              allSemesters={allSemesters} onAllSemesters={(on) => update({ semester: on ? "ALL" : null })}
              otherLevelsHref={otherLevelsHref}
              chips={chips} onClear={() => { setQuery(""); update({ category: null, status: null, owner: null, semester: null }); }}
              trailing={
                <>
                  <DropdownMenu>
                    <DropdownMenuTrigger render={<Button variant="outline" className="h-10" aria-label="Choose visible columns" />}><Columns className="size-4" /> Columns</DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {COLUMNS.filter((c) => hasContext || c.key !== "faculty").map((c) => (
                        <DropdownMenuCheckboxItem key={c.key} checked={!hidden.includes(c.key)} onCheckedChange={(on) => setHidden(on ? hidden.filter((k) => k !== c.key) : [...hidden, c.key])}>{c.label}</DropdownMenuCheckboxItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <div role="group" aria-label="View" className="flex rounded-lg border p-0.5">
                    <Button variant={view === "table" ? "secondary" : "ghost"} size="icon" className="size-9" aria-pressed={view === "table"} aria-label="Table view" onClick={() => setView("table")}><Rows className="size-4" /></Button>
                    <Button variant={view === "cards" ? "secondary" : "ghost"} size="icon" className="size-9" aria-pressed={view === "cards"} aria-label="Card view" onClick={() => setView("cards")}><SquaresFour className="size-4" /></Button>
                  </div>
                </>
              }
            />
          </div>

          {shown.length === 0 ? (
            <EmptyState title={emptyTitle} description="Try another term, category, status, or search." className="m-4" />
          ) : (
            <>
              {view === "table" && <div className="hidden md:block"><SubjectsTable {...sharedProps} onSelectAll={selectPage} visible={visible} /></div>}
              <div className={view === "table" ? "md:hidden" : undefined}><SubjectCards {...sharedProps} /></div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t p-3 text-sm">
                <p className="text-muted-foreground">Showing {pageIndex * pageSize + 1}–{Math.min(shown.length, (pageIndex + 1) * pageSize)} of {shown.length}</p>
                <div className="flex items-center gap-2">
                  <NativeSelect aria-label="Rows per page" value={String(pageSize)} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(0); }} options={PAGE_SIZES.map((n) => ({ value: String(n), label: `${n} per page` }))} />
                  <Button variant="outline" size="sm" disabled={pageIndex === 0} onClick={() => setPage(pageIndex - 1)}>Previous</Button>
                  <span className="tabular-nums">{pageIndex + 1} / {pageCount}</span>
                  <Button variant="outline" size="sm" disabled={pageIndex >= pageCount - 1} onClick={() => setPage(pageIndex + 1)}>Next</Button>
                </div>
              </div>
            </>
          )}
          {chosen.length > 0 && <BulkBar rows={chosen} canAssign={hasContext} onAssign={() => setAssigning(chosen.map((s) => s.id))} onClear={() => setSelected(new Set())} onDone={refresh} />}
        </Card>

        <FormDialog open={!!dialog.state} onOpenChange={(open) => !open && dialog.close()} title={editing ? `Edit ${editing.code}` : "Add subject"} description={heading} fields={fields} values={editing ?? { ...context, category: "MAJOR", semester: "FIRST", units: 3, lectureHours: 3, labHours: 0, requiredRoomType: "LECTURE_ROOM" }} submitLabel={editing ? "Save changes" : "Add subject"} successMessage={editing ? "Subject updated" : "Subject added"} onSubmit={(fd) => saveSubjectAction(editing?.id ?? null, fd)} />
        {archiving && <ArchiveButton hideTrigger open kind="SUBJECT" id={archiving.id} name={archiving.code} onOpenChange={(o) => !o && setArchiving(null)} onDone={refresh} />}
        {assign && assigning && <AssignFacultyModal subjects={subjects.filter((s) => assigning.includes(s.id))} context={assign} onClose={(saved) => { setAssigning(null); if (saved) refresh(); }} />}
        {assign && viewing && <ViewAssignedPanel subject={viewing} term={assign.term} onClose={() => setViewing(null)} />}
        {requesting && <RequestChangeModal subject={requesting.row} faculty={assign?.faculty ?? []} assignment={requesting.assignment} onClose={(sent) => { setRequesting(null); if (sent) router.refresh(); }} />}
      </div>
    </TooltipProvider>
  );
}
