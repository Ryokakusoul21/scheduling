"use client";

import Link from "next/link";
import { Plus, GraduationCap, Student, ArrowRight } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { ActionButton } from "@/components/ux/action-button";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog, FormDialog, useDialogState, type FormField } from "@/components/ux/form-dialog";
import { EmptyState, PageHeader } from "@/components/ux/states";
import { DragHandle, SortableList } from "@/components/ux/sortable-list";
import { useShortcut } from "@/components/ux/shortcuts";
import { useRovingFocus } from "@/hooks/use-roving-focus";
import { reorderAction } from "@/actions/reorder";
import { cn } from "@/lib/utils";
import { deleteProgramAction, saveProgramAction } from "./actions";

export interface ProgramRow {
  id: string;
  code: string;
  name: string;
  level: "COLLEGE" | "SENIOR_HIGH";
  departmentId: string;
  department: string | null;
  sections: number;
  subjects: number;
  terms: number;
}

export function programFields(level: "COLLEGE" | "SENIOR_HIGH", departments: { value: string; label: string }[]): FormField[] {
  return [
    { name: "level", label: "", type: "hidden" },
    { name: "code", label: level === "COLLEGE" ? "Course code" : "Strand code", type: "text", required: true, placeholder: level === "COLLEGE" ? "BSIT" : "STEM" },
    { name: "name", label: "Full name", type: "text", required: true, placeholder: level === "COLLEGE" ? "BS Information Technology" : "Science, Technology, Engineering and Mathematics" },
    ...(level === "COLLEGE"
      ? [{ name: "departmentId", label: "Department", type: "select" as const, required: true, options: [{ value: "", label: "Select department" }, ...departments] }]
      : []),
  ];
}

export function ProgramsManager({ programs, departments }: { programs: ProgramRow[]; departments: { value: string; label: string }[] }) {
  const dialog = useDialogState<ProgramRow | { level: ProgramRow["level"] }>();
  const del = useDialogState<ProgramRow>();

  useShortcut({ keys: "n", description: "Add a college course", group: "Programs", handler: () => dialog.openEdit({ level: "COLLEGE" }) });

  const target = dialog.state?.mode === "edit" ? dialog.state.item : null;
  const editing = target && "id" in target ? (target as ProgramRow) : null;
  const level = target?.level ?? "COLLEGE";
  const deleting = del.state?.mode === "edit" ? del.state.item : null;

  const sections: { level: ProgramRow["level"]; title: string; description: string; icon: typeof GraduationCap }[] = [
    { level: "COLLEGE", title: "College courses", description: "Each course has its own sections, subjects, and semesters.", icon: GraduationCap },
    { level: "SENIOR_HIGH", title: "Senior High School strands", description: "Strands group Grade 11–12 sections and specialized subjects.", icon: Student },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Programs & Strands"
        description="Manage College courses and Senior High strands. Drag the handle (or focus it and press Space) to reorder."
        actions={
          <>
            <Button variant="outline" onClick={() => dialog.openEdit({ level: "SENIOR_HIGH" })}>
              <Plus className="size-4" /> Add strand
            </Button>
            <Button onClick={() => dialog.openEdit({ level: "COLLEGE" })} aria-keyshortcuts="n">
              <Plus className="size-4" /> Add course
            </Button>
          </>
        }
      />

      {sections.map((s) => (
        <ProgramSection
          key={s.level}
          title={s.title}
          description={s.description}
          icon={s.icon}
          programs={programs.filter((p) => p.level === s.level)}
          onEdit={(p) => dialog.openEdit(p)}
          onDelete={(p) => del.openEdit(p)}
          onAdd={() => dialog.openEdit({ level: s.level })}
        />
      ))}

      <FormDialog
        open={!!dialog.state}
        onOpenChange={(o) => !o && dialog.close()}
        title={editing ? `Edit ${editing.code}` : level === "COLLEGE" ? "Add college course" : "Add Senior High School strand"}
        fields={programFields(level, departments)}
        values={editing ?? { level }}
        submitLabel={editing ? "Save changes" : "Add"}
        successMessage={editing ? "Saved" : "Added"}
        onSubmit={(fd) => saveProgramAction(editing?.id ?? null, fd)}
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && del.close()}
        title={`Delete ${deleting?.code ?? ""}?`}
        description="Only possible when no sections, subjects, or terms use it."
        successMessage="Deleted"
        onConfirm={() => deleteProgramAction(deleting!.id)}
      />
    </div>
  );
}

function ProgramSection({
  title,
  description,
  icon: Icon,
  programs,
  onEdit,
  onDelete,
  onAdd,
}: {
  title: string;
  description: string;
  icon: typeof GraduationCap;
  programs: ProgramRow[];
  onEdit: (p: ProgramRow) => void;
  onDelete: (p: ProgramRow) => void;
  onAdd: () => void;
}) {
  const { ref, onKeyDown, onFocus } = useRovingFocus({ orientation: "grid" });
  return (
    <section aria-labelledby={`h-${title}`} className="space-y-3">
      <div className="flex items-center gap-2">
        <Icon className="size-5 text-primary" />
        <h2 id={`h-${title}`} className="text-lg font-semibold">
          {title}
        </h2>
        <Badge variant="secondary">{programs.length}</Badge>
        <p className="hidden text-sm text-muted-foreground md:block">· {description}</p>
      </div>
      {programs.length === 0 ? (
        <EmptyState title={`No ${title.toLowerCase()} yet`} action={<Button onClick={onAdd}>Add one</Button>} />
      ) : (
        <div ref={ref} onKeyDown={onKeyDown} onFocus={onFocus} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <SortableList
            items={programs}
            layout="grid"
            getLabel={(p) => p.code}
            onReorder={(ids) => reorderAction("program", ids)}
            renderItem={(p, { setNodeRef, style, isDragging, handleProps }) => (
              <div
                ref={setNodeRef}
                style={style}
                className={cn("group relative rounded-xl border bg-card p-4 shadow-xs transition-shadow hover:shadow-md", isDragging && "shadow-lg ring-2 ring-primary")}
              >
                <div className="flex items-start gap-2">
                  <DragHandle {...handleProps} className="-ml-1" />
                  <Link
                    href={`/programs/${p.id}`}
                    data-roving=""
                    tabIndex={-1}
                    className="min-w-0 flex-1 rounded outline-none"
                    aria-label={`${p.code}, ${p.name}. Open to manage.`}
                  >
                    <p className="font-semibold">{p.code}</p>
                    <p className="line-clamp-2 text-sm text-muted-foreground">{p.name}</p>
                    {p.department && <p className="mt-1 truncate text-xs text-muted-foreground">{p.department}</p>}
                  </Link>
                  <div className="flex shrink-0 items-center justify-end gap-1.5 whitespace-nowrap">
                    <ActionButton kind="edit" onClick={() => onEdit(p)}>
                      Edit
                    </ActionButton>
                    <ActionButton kind="delete" onClick={() => onDelete(p)}>
                      Delete
                    </ActionButton>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <Badge variant="secondary">{p.sections} sections</Badge>
                  <Badge variant="secondary">{p.subjects} subjects</Badge>
                  {p.level === "COLLEGE" && <Badge variant="outline">{p.terms} own semesters</Badge>}
                  <ArrowRight className="ml-auto size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
                </div>
              </div>
            )}
          />
        </div>
      )}
    </section>
  );
}
