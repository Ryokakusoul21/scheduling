"use client";

import Link from "next/link";
import { Plus, GraduationCap, Student, ArrowRight } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { ActionButton } from "@/components/ux/action-button";
import { Badge } from "@/components/ui/badge";
import { CollectionView, RecordsTable } from "@/components/ux/collection-view";
import { MobileRecordTable } from "@/components/ux/mobile-record-table";
import { RecordActions } from "@/components/ux/record-actions";
import { ConfirmDialog, FormDialog, useDialogState, type FormField } from "@/components/ux/form-dialog";
import { EmptyState } from "@/components/ux/states";
import { useShortcut } from "@/components/ux/shortcuts";
import { useRovingFocus } from "@/hooks/use-roving-focus";
import { deleteProgramAction, saveProgramAction } from "./actions";
import type { AcademicLevel } from "@/lib/academics/levels";

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
    { name: "departmentId", label: "Department", type: "select", required: true, options: [{ value: "", label: "Select department" }, ...departments] },
  ];
}

export function ProgramsManager({ programs, departments, activeLevel }: { programs: ProgramRow[]; departments: { value: string; label: string }[]; activeLevel: AcademicLevel }) {
  const dialog = useDialogState<ProgramRow | { level: ProgramRow["level"] }>();
  const del = useDialogState<ProgramRow>();

  const catalogLevel = activeLevel === "COLLEGE" || activeLevel === "SENIOR_HIGH" ? activeLevel : null;
  const visiblePrograms = programs.filter((program) => program.level === activeLevel);
  useShortcut(catalogLevel ? { keys: "n", description: catalogLevel === "COLLEGE" ? "Add a college course" : "Add a Senior High strand", group: "Programs", handler: () => dialog.openEdit({ level: catalogLevel }) } : null);

  const target = dialog.state?.mode === "edit" ? dialog.state.item : null;
  const editing = target && "id" in target ? (target as ProgramRow) : null;
  const level = target?.level ?? catalogLevel ?? "COLLEGE";
  const deleting = del.state?.mode === "edit" ? del.state.item : null;
  const mobileTable = <MobileRecordTable label="Programs summary" column={activeLevel === "COLLEGE" ? "Course" : "Strand"} rows={visiblePrograms.map((program) => ({
    id: program.id, name: program.code, href: `/programs/${program.id}`, summary: `${program.sections} sections`,
    actions: <RecordActions label={program.code} onEdit={() => dialog.openEdit(program)} onDelete={() => del.openEdit(program)} />,
    details: <><p className="font-medium">{program.name}</p>{program.department && <p className="text-muted-foreground">{program.department}</p>}<p>{program.subjects} subjects</p>{program.terms > 0 && <p>{program.terms} own semesters</p>}<Link href={`/programs/${program.id}`} className="inline-flex min-h-11 items-center font-medium text-primary">View {program.level === "COLLEGE" ? "course" : "strand"} <ArrowRight className="ml-1 size-4" /></Link></>,
  }))} />;

  const sections: { level: ProgramRow["level"]; title: string; description: string; icon: typeof GraduationCap }[] = [
    { level: "COLLEGE", title: "College courses", description: "Each course has its own sections, subjects, and semesters.", icon: GraduationCap },
    { level: "SENIOR_HIGH", title: "Senior High School strands", description: "Strands group Grade 11–12 sections and specialized subjects.", icon: Student },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-start justify-between gap-3 md:flex-row">
        <div><h2 className="text-xl font-semibold tracking-tight">Academic Programs</h2><p className="mt-1 max-w-prose text-sm leading-relaxed text-muted-foreground">{activeLevel === "COLLEGE" ? "Manage College courses and use the academic calendar above to configure terms." : activeLevel === "SENIOR_HIGH" ? "Manage Senior High School strands and use the academic calendar above to configure terms." : "Configure this level’s academic calendar above."}</p></div>
        {catalogLevel && <Button className="min-h-11 w-full px-4 md:min-h-0 md:w-auto" onClick={() => dialog.openEdit({ level: catalogLevel })} aria-keyshortcuts="n"><Plus className="size-4" />{catalogLevel === "COLLEGE" ? "Add course" : "Add strand"}</Button>}
      </div>

      {catalogLevel && <CollectionView storageKey="programs:view" label="Programs" mobileTable={mobileTable} table={<RecordsTable label="Programs" columns={["Program", "Level", "Department", "Sections", "Subjects", "Semesters", "Actions"]} rows={visiblePrograms.map((p) => ({ id: p.id, label: p.code, cells: [<Link key="name" href={`/programs/${p.id}`} className="font-medium text-primary hover:underline">{p.code}<span className="block text-xs text-muted-foreground">{p.name}</span></Link>, p.level === "COLLEGE" ? "College" : "Senior High", p.department ?? "—", p.sections, p.subjects, p.terms, <div key="actions" className="flex gap-1.5"><ActionButton kind="edit" onClick={() => dialog.openEdit(p)}>Edit</ActionButton><ActionButton kind="delete" onClick={() => del.openEdit(p)}>Delete</ActionButton></div>] }))} />}>
      {sections.filter((s) => s.level === activeLevel).map((s) => (
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
      </CollectionView>}

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
        <div ref={ref} onKeyDown={onKeyDown} onFocus={onFocus} className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {programs.map((p) => (
              <div
                key={p.id}
                className="group relative min-w-0 rounded-2xl border bg-card p-4 shadow-xs transition-shadow hover:shadow-md md:rounded-xl"
              >
                <div className="flex items-start gap-2">
                  <Link
                    href={`/programs/${p.id}`}
                    data-roving=""
                    tabIndex={-1}
                    className="min-w-0 flex-1 rounded outline-none after:absolute after:inset-0 after:rounded-2xl focus-visible:after:ring-2 focus-visible:after:ring-ring"
                    aria-label={`${p.code}, ${p.name}. Open to manage.`}
                  >
                    <p className="text-lg font-semibold [overflow-wrap:anywhere]">{p.code}</p>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{p.name}</p>
                    {p.department && <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{p.department}</p>}
                  </Link>
                  <RecordActions label={p.code} onEdit={() => onEdit(p)} onDelete={() => onDelete(p)} />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <Badge variant="secondary">{p.sections} sections</Badge>
                  <Badge variant="secondary">{p.subjects} subjects</Badge>
                  {p.level === "COLLEGE" && p.terms > 0 && <Badge variant="outline">{p.terms} own semesters</Badge>}
                </div>
                <p className="mt-4 flex min-h-11 items-center justify-between border-t pt-3 text-sm font-medium text-primary">View {p.level === "COLLEGE" ? "course" : "strand"}<ArrowRight className="size-4" aria-hidden /></p>
              </div>
          ))}
        </div>
      )}
    </section>
  );
}
