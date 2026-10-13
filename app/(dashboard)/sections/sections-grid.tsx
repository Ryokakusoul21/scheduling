"use client";

import Link from "next/link";
import { CalendarDots, Plus, UsersThree } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { ActionButton } from "@/components/ux/action-button";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog, FormDialog, useDialogState, type FormField } from "@/components/ux/form-dialog";
import { DragHandle, SortableList } from "@/components/ux/sortable-list";
import { EmptyState } from "@/components/ux/states";
import { useShortcut } from "@/components/ux/shortcuts";
import { useRovingFocus } from "@/hooks/use-roving-focus";
import { reorderAction } from "@/actions/reorder";
import { LEVELS, gradeLabel, type AcademicLevel } from "@/lib/academics/levels";
import { cn } from "@/lib/utils";
import { deleteSectionAction, saveSectionAction } from "./actions";

export interface SectionRow {
  id: string;
  name: string;
  studentCount: number;
  level: string;
  programId: string;
  program: string | null;
  yearLevel: string;
  gradeLevel: string;
  semesterId: string;
  term: string | null;
  classes: number;
}

export function SectionsGrid({
  heading,
  context,
  sections,
  strands,
  terms,
}: {
  heading: string;
  context: { level: string; programId: string; yearLevel: string; gradeLevel: string };
  sections: SectionRow[];
  strands: { value: string; label: string }[];
  terms: { value: string; label: string }[];
}) {
  const dialog = useDialogState<SectionRow>();
  const del = useDialogState<SectionRow>();
  const { ref, onKeyDown, onFocus } = useRovingFocus({ orientation: "grid" });
  const level = context.level as AcademicLevel;
  const isCollege = level === "COLLEGE";

  useShortcut({ keys: "n", description: "Add a section", group: "Sections", handler: dialog.openCreate });

  const editing = dialog.state?.mode === "edit" ? dialog.state.item : null;
  const deleting = del.state?.mode === "edit" ? del.state.item : null;

  const fields: FormField[] = [
    { name: "level", label: "", type: "hidden" },
    ...(isCollege
      ? [
          { name: "programId", label: "", type: "hidden" as const },
          { name: "yearLevel", label: "", type: "hidden" as const },
        ]
      : []),
    { name: "name", label: "Section name", type: "text", required: true, placeholder: isCollege ? "BSIT 1C" : level === "SENIOR_HIGH" ? "11-STEM B" : "Grade 7 - Mabini" },
    { name: "studentCount", label: "Number of learners", type: "number", min: 0, required: true, help: "Used to check room capacity in the Scheduler." },
    ...(!isCollege
      ? [
          {
            name: "gradeLevel",
            label: "Grade level",
            type: "select" as const,
            required: true,
            options: LEVELS[level].grades.map((g) => ({ value: g, label: gradeLabel(g) })),
          },
        ]
      : []),
    ...(level === "SENIOR_HIGH"
      ? [{ name: "programId", label: "Strand", type: "select" as const, required: true, options: [{ value: "", label: "Select strand" }, ...strands] }]
      : []),
    ...(isCollege
      ? [{ name: "semesterId", label: "Term (optional)", type: "select" as const, options: [{ value: "", label: "Not tied to a term" }, ...terms] }]
      : []),
  ];

  return (
    <section aria-label={heading} className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold">{heading}</h2>
          <p className="text-xs text-muted-foreground">
            {sections.length} sections · {sections.reduce((s, x) => s + x.studentCount, 0)} learners · drag the handle to reorder
          </p>
        </div>
        <Button onClick={dialog.openCreate} aria-keyshortcuts="n">
          <Plus className="size-4" /> Add section
        </Button>
      </div>

      {sections.length === 0 ? (
        <EmptyState
          icon={UsersThree}
          title="No sections yet"
          description="Create the class sections for this level so they can be scheduled."
          action={<Button onClick={dialog.openCreate}>Add section</Button>}
        />
      ) : (
        <div ref={ref} onKeyDown={onKeyDown} onFocus={onFocus} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <SortableList
            items={sections}
            layout="grid"
            getLabel={(s) => s.name}
            onReorder={(ids) => reorderAction("section", ids)}
            renderItem={(s, { setNodeRef, style, isDragging, handleProps }) => (
              <div
                ref={setNodeRef}
                style={style}
                className={cn("rounded-xl border bg-card p-4 shadow-xs transition-shadow hover:shadow-md", isDragging && "shadow-lg ring-2 ring-primary")}
              >
                <div className="flex items-start gap-2">
                  <DragHandle {...handleProps} className="-ml-1" />
                  <button
                    type="button"
                    data-roving=""
                    tabIndex={-1}
                    onClick={() => dialog.openEdit(s)}
                    className="min-w-0 flex-1 rounded text-left outline-none"
                    aria-label={`${s.name}, ${s.studentCount} learners. Press Enter to edit.`}
                  >
                    <p className="truncate font-semibold">{s.name}</p>
                    <p className="text-sm text-muted-foreground">{s.studentCount} learners</p>
                  </button>
                  <div className="flex shrink-0 items-center justify-end gap-1.5 whitespace-nowrap">
                    <ActionButton kind="edit" onClick={() => dialog.openEdit(s)}>
                      Edit
                    </ActionButton>
                    <ActionButton kind="delete" onClick={() => del.openEdit(s)}>
                      Delete
                    </ActionButton>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  {s.program && <Badge variant="secondary">{s.program}</Badge>}
                  {s.term && <Badge variant="outline">{s.term}</Badge>}
                  <Badge variant={s.classes ? "secondary" : "outline"}>{s.classes} classes</Badge>
                  <Link
                    href={`/scheduler?level=${s.level}&sectionId=${s.id}`}
                    className="ml-auto inline-flex items-center gap-1 rounded text-xs font-medium text-primary hover:underline"
                  >
                    <CalendarDots className="size-3.5" /> Timetable
                  </Link>
                </div>
              </div>
            )}
          />
        </div>
      )}

      <FormDialog
        open={!!dialog.state}
        onOpenChange={(o) => !o && dialog.close()}
        title={editing ? `Edit ${editing.name}` : "Add section"}
        description={heading}
        fields={fields}
        values={editing ?? { ...context, studentCount: 40 }}
        submitLabel={editing ? "Save changes" : "Add section"}
        successMessage={editing ? "Section updated" : "Section added"}
        onSubmit={(fd) => saveSectionAction(editing?.id ?? null, fd)}
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && del.close()}
        title={`Delete ${deleting?.name ?? "section"}?`}
        description="Sections with scheduled classes can't be deleted."
        successMessage="Section deleted"
        onConfirm={() => deleteSectionAction(deleting!.id)}
      />
    </section>
  );
}
