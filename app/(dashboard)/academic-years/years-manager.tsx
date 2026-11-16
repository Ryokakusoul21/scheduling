"use client";

import { useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowRight, CalendarBlank, Plus } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { ActionButton } from "@/components/ux/action-button";
import { Badge } from "@/components/ui/badge";
import { CardGrid } from "@/components/ux/card-grid";
import { CollectionView, RecordsTable } from "@/components/ux/collection-view";
import { MobileRecordTable } from "@/components/ux/mobile-record-table";
import { RecordActions } from "@/components/ux/record-actions";
import { EmptyState, PageHeader } from "@/components/ux/states";
import { ConfirmDialog, FormDialog, useDialogState, type FormField } from "@/components/ux/form-dialog";
import { useShortcut } from "@/components/ux/shortcuts";
import { cn } from "@/lib/utils";
import { ACADEMIC_LEVELS } from "@/lib/academics/levels";
import { deleteAcademicYearAction, saveAcademicYearAction, setActiveAcademicYearAction } from "./actions";

interface Year {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  termCount: number;
  levelsConfigured: number;
  activeTerms: number;
}

const FIELDS: FormField[] = [
  { name: "name", label: "Name", type: "text", required: true, placeholder: "2026-2027", help: "Format: YYYY-YYYY" },
  { name: "startDate", label: "Start date", type: "date", required: true },
  { name: "endDate", label: "End date", type: "date", required: true },
  { name: "isActive", label: "Set as the active academic year", type: "checkbox" },
];

function fmt(date: string) {
  return new Date(date).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

export function YearsManager({ years, embedded = false }: { years: Year[]; embedded?: boolean }) {
  const dialog = useDialogState<Year>();
  const del = useDialogState<Year>();
  const [pending, startTransition] = useTransition();

  useShortcut(embedded ? null : { keys: "n", description: "New academic year", group: "Academic years", handler: dialog.openCreate });

  const editing = dialog.state?.mode === "edit" ? dialog.state.item : null;
  const deleting = del.state?.mode === "edit" ? del.state.item : null;
  const description = "Manage academic years, then open a year to configure semesters or grading quarters.";
  const createButton = <Button className="min-h-11 w-full px-4 md:min-h-0 md:w-auto" onClick={dialog.openCreate} aria-label="New academic year" aria-keyshortcuts={embedded ? undefined : "n"}><Plus className="size-4" /><span className="md:hidden">Add year</span><span className="hidden md:inline">New academic year</span></Button>;
  const activate = (year: Year) => startTransition(async () => {
    try {
      await setActiveAcademicYearAction(year.id);
      toast.success(`${year.name} is now the active academic year`);
    } catch {
      toast.error("Could not activate this academic year. Please try again.");
    }
  });
  const actions = (year: Year) => <RecordActions label={`academic year ${year.name}`} onEdit={() => dialog.openEdit(year)} onDelete={() => del.openEdit(year)} onActivate={year.isActive ? undefined : () => activate(year)} disabled={pending} />;
  const mobileTable = <MobileRecordTable label="Academic years summary" column="Academic year" rows={years.map((year) => ({
    id: year.id, name: year.name, href: `/academic-years/${year.id}`,
    summary: year.isActive ? <Badge>Active</Badge> : "Inactive",
    actions: actions(year),
    details: <><dl className="space-y-2"><div><dt className="text-xs text-muted-foreground">Starts</dt><dd>{fmt(year.startDate)}</dd></div><div><dt className="text-xs text-muted-foreground">Ends</dt><dd>{fmt(year.endDate)}</dd></div><div><dt className="text-xs text-muted-foreground">Terms</dt><dd>{year.termCount}</dd></div><div><dt className="text-xs text-muted-foreground">Levels set up</dt><dd>{year.levelsConfigured}/{ACADEMIC_LEVELS.length}</dd></div></dl><Link href={`/academic-years/${year.id}`} className="inline-flex min-h-11 items-center font-medium text-primary">Open year <ArrowRight className="ml-1 size-4" /></Link></>,
  }))} />;

  return (
    <div className="space-y-4">
      {embedded ? <div className="flex flex-col items-start justify-between gap-3 md:flex-row"><div><h1 className="text-xl font-semibold tracking-tight md:text-2xl">Academic Years and Terms</h1><p className="mt-1 max-w-prose text-sm leading-relaxed text-muted-foreground">{description}</p></div>{createButton}</div> : <PageHeader
        title="Academic Years and Terms"
        description={description}
        actions={createButton}
      />}

      {years.length === 0 ? (
        <EmptyState
          icon={CalendarBlank}
          title="No academic years yet"
          description="Create the first academic year to start setting up terms."
          action={<Button onClick={dialog.openCreate}>Create academic year</Button>}
        />
      ) : (
        <CollectionView storageKey="academic-years:view" label="Academic years" mobileTable={mobileTable} table={<RecordsTable label="Academic years" columns={["Academic year", "Dates", "Status", "Terms", "Levels set up", "Actions"]} rows={years.map((y) => ({ id: y.id, cells: [<Link key="year" href={`/academic-years/${y.id}`} className="font-semibold text-primary hover:underline">{y.name}</Link>, `${fmt(y.startDate)} – ${fmt(y.endDate)}`, y.isActive ? <Badge key="status">Active</Badge> : "Inactive", y.termCount, `${y.levelsConfigured}/${ACADEMIC_LEVELS.length}`, <div key="actions" className="flex gap-1.5"><ActionButton kind="edit" onClick={() => dialog.openEdit(y)}>Edit</ActionButton>{!y.isActive && <ActionButton kind="activate" disabled={pending} onClick={() => activate(y)}>Set as active</ActionButton>}<ActionButton kind="delete" onClick={() => del.openEdit(y)}>Delete</ActionButton></div>] }))} />}>
        <CardGrid label="Academic years" className="sm:grid-cols-1 md:grid-cols-2">
          {years.map((y) => (
            <div
              key={y.id}
              className={cn(
                "group relative min-w-0 rounded-2xl border bg-card p-4 shadow-xs transition-shadow hover:shadow-md md:rounded-xl",
                y.isActive && "border-primary ring-2 ring-primary/20"
              )}
            >
              <div className="flex items-start justify-between gap-3">
              <Link
                href={`/academic-years/${y.id}`}
                data-roving=""
                tabIndex={-1}
                className="min-w-0 flex-1 rounded-lg outline-none after:absolute after:inset-0 after:rounded-2xl focus-visible:after:ring-2 focus-visible:after:ring-ring"
                aria-label={`Academic year ${y.name}${y.isActive ? ", active" : ""}. ${y.termCount} terms. Open to manage terms.`}
              >
                <div className="flex items-center gap-3">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <CalendarBlank className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-muted-foreground">Academic year</p>
                    <p className="text-lg font-semibold [overflow-wrap:anywhere]">{y.name}</p>
                  </div>
                </div>
              </Link>
              {actions(y)}
              </div>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{fmt(y.startDate)} <span aria-hidden>–</span> {fmt(y.endDate)}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {y.isActive && <Badge>Active</Badge>}
                <Badge variant="secondary">{y.termCount} terms</Badge>
                <Badge variant="outline">{y.levelsConfigured}/{ACADEMIC_LEVELS.length} levels set up</Badge>
              </div>
              <p className="mt-4 flex min-h-11 items-center justify-between border-t pt-3 text-sm font-medium text-primary">Open year <ArrowRight className="size-4" aria-hidden /></p>
            </div>
          ))}
        </CardGrid>
        </CollectionView>
      )}

      <FormDialog
        open={!!dialog.state}
        onOpenChange={(o) => !o && dialog.close()}
        title={editing ? `Edit Academic Year ${editing.name}` : "New academic year"}
        fields={FIELDS}
        values={editing ?? {}}
        submitLabel={editing ? "Save changes" : "Create"}
        successMessage={editing ? "Academic year updated" : "Academic year created"}
        onSubmit={(fd) => saveAcademicYearAction(editing?.id ?? null, fd)}
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && del.close()}
        title={`Delete Academic Year ${deleting?.name ?? ""}?`}
        description="This can only be done when the academic year has no terms."
        successMessage="Academic year deleted"
        onConfirm={() => deleteAcademicYearAction(deleting!.id)}
      />
    </div>
  );
}
