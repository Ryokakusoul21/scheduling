"use client";

import { useOptimistic, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ListChecks, MagnifyingGlass, Plus } from "@phosphor-icons/react/ssr";
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
import { ROW_GRID, RuleRow, StrengthBadge, type RowHandlers } from "./rule-row";
import { deleteConstraintAction, saveConstraintAction, toggleConstraintAction } from "./actions";

type Option = { value: string; label: string };
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
  subjects,
}: {
  isAdmin: boolean;
  rows: ConstraintRow[];
  departments: Option[];
  faculty: Option[];
  subjects: Option[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tab: Category = CATEGORIES.some((c) => c.value === params.get("tab")) ? (params.get("tab") as Category) : "faculty";
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<{ row: ConstraintRow | "new"; category: CreateCategory } | null>(null);
  const [deleting, setDeleting] = useState<ConstraintRow | null>(null);
  const [, startTransition] = useTransition();
  // Toggles show at once and roll back by themselves if the server refuses.
  const [shown, setOptimistic] = useOptimistic(rows, (state, change: { id: string; enabled: boolean }) =>
    state.map((r) => (r.id === change.id ? { ...r, enabled: change.enabled } : r))
  );
  const names = new Map([...faculty, ...subjects].map((o) => [o.value, o.label]));

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

  const inTab = shown.filter((r) => categoryOf(r.kind, r.params) === tab);
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
        description={narrowed ? "Try another filter or search." : "Add one with the button below."}
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
          description="Rules the scheduler follows when building timetables. School-wide rules set by the Administrator are read-only."
          actions={
            <Button className="h-9" onClick={() => add(tab)}>
              <Plus className="size-4" /> Add constraint
            </Button>
          }
        />

        <div className="space-y-3">
          <div role="tablist" aria-label="Constraint categories" className="-mx-1 flex gap-1 overflow-x-auto border-b px-1">
            {CATEGORIES.map((c) => {
              const count = shown.filter((r) => categoryOf(r.kind, r.params) === c.value).length;
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
          <dl className="flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-muted-foreground">
            <div className="flex items-center gap-2"><dt><StrengthBadge hard /></dt><dd>The scheduler will never break this rule.</dd></div>
            <div className="flex items-center gap-2"><dt><StrengthBadge hard={false} /></dt><dd>The scheduler tries to follow this rule.</dd></div>
          </dl>
        </div>

        <div id="constraints-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Filter rules">
              {FILTERS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  aria-pressed={filter === f.value}
                  onClick={() => setFilter(f.value)}
                  className="h-8 rounded-full border px-3 text-[13px] font-medium transition-colors duration-150 hover:bg-muted aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background"
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div className="relative w-full sm:w-72">
              <MagnifyingGlass className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search ${label.toLowerCase()}`} aria-label={`Search ${label.toLowerCase()} by title`} className="h-9 pl-9" />
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
            subjects={subjects}
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
