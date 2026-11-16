"use client";

import { useOptimistic, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { CaretRight, ListChecks, Lock, MagnifyingGlass, Plus } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ConfirmDialog } from "@/components/ux/form-dialog";
import { EmptyState, PageHeader } from "@/components/ux/states";
import { CONSTRAINT_INFO } from "@/lib/scheduler/constraints";
import { cn } from "@/lib/utils";
import { CATEGORIES, categoryOf, type Category, type ConstraintRow, type CreateCategory } from "./categories";
import { ConstraintDialog } from "./constraint-dialog";
import { FacultyPreferences } from "./faculty-preferences";
import { CompactRuleRow, ROW_GRID, RuleRow, StrengthBadge, type RowHandlers } from "./rule-row";
import { isClassPolicy } from "@/lib/scheduler/class-policies";
import type { PolicyOptions } from "./class-policy-fields";
import { TimetableConfiguration } from "@/components/scheduler/timetable-configuration";
import { deleteConstraintAction, saveConstraintAction, toggleConstraintAction } from "./actions";

type Option = { value: string; label: string; partTime?: boolean };
type Filter = "all" | "required" | "preferred" | "active" | "inactive";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "required", label: "Required" },
  { value: "preferred", label: "Preferred" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

const matches = (r: ConstraintRow, filter: Filter) =>
  filter === "all" ||
  (filter === "required" && CONSTRAINT_INFO[r.kind].hard) ||
  (filter === "preferred" && !CONSTRAINT_INFO[r.kind].hard) ||
  (filter === "active" && r.enabled) ||
  (filter === "inactive" && !r.enabled);

export function ConstraintsManager({
  isAdmin,
  rows,
  departments,
  faculty,
  rooms,
  subjects,
  policyOptions,
}: {
  isAdmin: boolean;
  rows: ConstraintRow[];
  departments: Option[];
  faculty: Option[];
  rooms: Option[];
  subjects: Option[];
  policyOptions: PolicyOptions;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tab: Category = CATEGORIES.some((c) => c.value === params.get("tab")) ? (params.get("tab") as Category) : "schedule";
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<{ row: ConstraintRow | "new"; category: CreateCategory } | null>(null);
  const [deleting, setDeleting] = useState<ConstraintRow | null>(null);
  const [, startTransition] = useTransition();
  // Toggles show at once and roll back by themselves if the server refuses.
  const [shown, setOptimistic] = useOptimistic(rows, (state, change: { id: string; enabled: boolean }) =>
    state.map((r) => (r.id === change.id ? { ...r, enabled: change.enabled } : r))
  );
  const names = new Map([...faculty, ...rooms, ...subjects, ...policyOptions.terms, ...policyOptions.programs, ...policyOptions.sections, ...policyOptions.classes].map((o) => [o.value, o.label]));

  function selectTab(next: Category) {
    const q = new URLSearchParams(params.toString());
    q.set("tab", next);
    router.replace(`${pathname}?${q}`, { scroll: false });
  }

  function toggle(row: ConstraintRow, enabled: boolean, undoable = true) {
    startTransition(async () => {
      setOptimistic({ id: row.id, enabled });
      const res = await toggleConstraintAction(row.id, enabled);
      if (!res.ok) return void toast.error(res.error ?? `Could not turn ${enabled ? "on" : "off"} ${row.name}.`);
      toast.success(`${row.name} turned ${enabled ? "on" : "off"}`, undoable ? { action: { label: "Undo", onClick: () => toggle(row, !enabled, false) } } : undefined);
    });
  }

  function duplicate(row: ConstraintRow) {
    if (isClassPolicy(row.kind)) { setEditing({ row: { ...row, id: "", name: `${row.name} (copy)` }, category: "schedule" }); return; }
    startTransition(async () => {
      const res = await saveConstraintAction(null, { kind: row.kind, name: `${row.name} (copy)`, params: row.params, departmentId: row.departmentId, enabled: row.enabled });
      if (res.ok) toast.success(`${row.name} duplicated`);
      else toast.error(res.error ?? "Could not duplicate.");
    });
  }

  const handlers: RowHandlers = {
    onToggle: toggle,
    onEdit: (row) => setEditing({ row, category: tab }),
    onDuplicate: duplicate,
    onDelete: setDeleting,
  };
  const add = (category: CreateCategory) => setEditing({ row: "new", category });

  const schoolRules = shown.filter((r) => !r.departmentId);
  const departmentRules = shown.filter((r) => !!r.departmentId);
  const inTab = departmentRules.filter((r) => categoryOf(r.kind, r.params) === tab);
  const visible = inTab
    .filter((r) => matches(r, filter) && r.name.toLowerCase().includes(query.trim().toLowerCase()))
    // Required rules first, then Preferred; the server order is kept within each.
    .sort((a, b) => Number(CONSTRAINT_INFO[b.kind].hard) - Number(CONSTRAINT_INFO[a.kind].hard));
  const rules = visible.filter((r) => r.kind !== "PREFERRED_TIME");
  const preferences = visible.filter((r) => r.kind === "PREFERRED_TIME");
  const narrowed = filter !== "all" || query.trim() !== "";
  const label = CATEGORIES.find((c) => c.value === tab)!.label;

  const ruleList =
    rules.length === 0 ? (
      <EmptyState
        icon={ListChecks}
        title={narrowed ? "No rules match" : `No ${tab === "faculty" ? "faculty-wide rules" : label.toLowerCase()} yet`}
        description={narrowed ? "Try another filter." : undefined}
        action={!narrowed && <Button onClick={() => add(tab)}><Plus className="size-4" /> Add rule</Button>}
        className="py-8"
      />
    ) : (
      <div className="lg:rounded-xl lg:border lg:bg-card">
        <div className={cn(ROW_GRID, "hidden border-b px-4 py-2.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase lg:grid")} aria-hidden>
          <span>Rule</span>
          <span>Settings</span>
          <span>Status</span>
          <span />
        </div>
        <ul className="space-y-3 lg:space-y-0 lg:divide-y" aria-label={label}>
          {rules.map((r) => (
            <RuleRow key={r.id} row={r} names={names} isAdmin={isAdmin} {...handlers} />
          ))}
        </ul>
      </div>
    );

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <PageHeader
          title="Scheduling Constraints"
          description="Rules the scheduler follows."
          actions={
            <Button className="h-9" onClick={() => add(tab)}>
              <Plus className="size-4" /> Add constraint
            </Button>
          }
        />

        {schoolRules.length > 0 && <details className="group rounded-xl border bg-card">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold">
            <CaretRight className="size-4 transition-transform group-open:rotate-90" aria-hidden />
            School-wide
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums">{schoolRules.length}</span>
            {!isAdmin && <span className="ml-auto inline-flex items-center gap-1 text-xs font-normal text-muted-foreground"><Lock className="size-3.5" aria-hidden />Read only</span>}
          </summary>
          {([true, false] as const).map((hard) => {
            const group = schoolRules.filter((r) => CONSTRAINT_INFO[r.kind].hard === hard);
            return group.length > 0 && <section key={String(hard)} className="border-t">
              <h3 className="flex items-center gap-2 bg-muted/40 px-4 py-1.5"><StrengthBadge hard={hard} /><span className="text-xs tabular-nums text-muted-foreground">{group.length}</span></h3>
              <ul className="divide-y">{group.map((rule) => <CompactRuleRow key={rule.id} row={rule} names={names} {...handlers} />)}</ul>
            </section>;
          })}
        </details>}
        {tab === "schedule" && <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3"><h2 className="text-sm font-semibold">Timetable defaults</h2><TimetableConfiguration terms={policyOptions.terms.map((t) => ({ id: t.value, label: `${policyOptions.years?.find((year) => year.value === t.academicYearId)?.label ?? ""} - ${t.label}` }))} departments={departments.map((d) => ({ id: d.value, name: d.label }))} canManageSchool={isAdmin} triggerLabel="Configure timetable defaults" /></section>}
        <div className="space-y-3">
          <div role="tablist" aria-label="Constraint categories" className="-mx-1 flex gap-1 overflow-x-auto border-b px-1">
            {CATEGORIES.map((c) => {
              const count = departmentRules.filter((r) => categoryOf(r.kind, r.params) === c.value).length;
              const selected = tab === c.value;
              return (
                <button
                  key={c.value}
                  id={`tab-${c.value}`}
                  role="tab"
                  type="button"
                  aria-selected={selected}
                  aria-controls="constraints-panel"
                  tabIndex={selected ? 0 : -1}
                  onClick={() => selectTab(c.value)}
                  onKeyDown={(e) => {
                    const i = CATEGORIES.findIndex((x) => x.value === c.value);
                    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
                    if (!step) return;
                    const next = CATEGORIES[(i + step + CATEGORIES.length) % CATEGORIES.length].value;
                    selectTab(next);
                    document.getElementById(`tab-${next}`)?.focus();
                  }}
                  className={cn(
                    "-mb-px flex shrink-0 items-center gap-2 rounded-t-md border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors duration-150",
                    selected ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                >
                  {c.label}
                  <span className={cn("rounded-full px-2 py-0.5 text-xs tabular-nums", selected ? "bg-primary/10 text-primary" : "bg-muted")}>{count}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div id="constraints-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1 rounded-lg bg-muted/60 p-1" role="group" aria-label="Filter rules">
              {FILTERS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  aria-pressed={filter === f.value}
                  onClick={() => setFilter(f.value)}
                  className="h-7 rounded-md px-3 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground aria-pressed:bg-card aria-pressed:text-primary aria-pressed:shadow-sm"
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div className="relative w-full sm:w-72">
              <MagnifyingGlass className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" aria-label={`Search ${label.toLowerCase()} by title`} className="h-9 pl-9" />
            </div>
          </div>

          {tab === "faculty" ? (
            <>
              <section aria-labelledby="faculty-wide-title" className="space-y-3">
                <h3 id="faculty-wide-title" className="font-semibold">Faculty-wide rules</h3>
                {ruleList}
              </section>
              {filter !== "required" && (
                <FacultyPreferences rows={preferences} names={names} onAdd={narrowed ? undefined : () => add("preference")} {...handlers} />
              )}
            </>
          ) : (
            ruleList
          )}
        </div>

        {editing && (
          <ConstraintDialog
            key={editing.row === "new" ? `new-${editing.category}` : editing.row.id}
            row={editing.row}
            initialCategory={editing.category}
            onClose={() => setEditing(null)}
            isAdmin={isAdmin}
            departments={departments}
            faculty={faculty}
            rooms={rooms}
            subjects={subjects}
            policyOptions={policyOptions}
          />
        )}
        <ConfirmDialog
          open={!!deleting}
          onOpenChange={(o) => !o && setDeleting(null)}
          title={`Delete "${deleting?.name}"?`}
          description="The scheduler will stop checking this rule. This cannot be undone."
          onConfirm={() => deleteConstraintAction(deleting!.id)}
          successMessage={`${deleting?.name} deleted`}
        />
      </div>
    </TooltipProvider>
  );
}
