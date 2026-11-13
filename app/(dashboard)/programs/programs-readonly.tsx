"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, GraduationCap, Student } from "@phosphor-icons/react/ssr";
import { Badge } from "@/components/ui/badge";
import { CollectionView, RecordsTable } from "@/components/ux/collection-view";
import { Button } from "@/components/ui/button";
import { FormDialog } from "@/components/ux/form-dialog";
import { EmptyState, PageHeader } from "@/components/ux/states";
import { renameDepartmentAction } from "./actions";
import type { ProgramRow } from "./programs-manager";

export interface DepartmentRow {
  id: string;
  name: string;
  canRename: boolean;
}

const LEVELS = [
  { level: "COLLEGE", title: "College courses", icon: GraduationCap },
  { level: "SENIOR_HIGH", title: "Senior High School strands", icon: Student },
] as const;

/** Programs of the viewer's own department(s): every card opens the detail page, and only the department name can change. */
export function ProgramsReadOnly({ programs, departments }: { programs: ProgramRow[]; departments: DepartmentRow[] }) {
  const [renaming, setRenaming] = useState<DepartmentRow | null>(null);
  const names = departments.map((d) => d.name).join(", ");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Academic Programs"
        description={names ? `Programs under ${names}.` : "Programs under your department."}
        actions={<>{names && <Badge variant="secondary" className="h-7 px-2.5 text-sm">Viewing: {names}</Badge>}{departments.filter((d) => d.canRename).map((d) => <Button key={d.id} variant="outline" size="sm" onClick={() => setRenaming(d)}>Rename {d.name}</Button>)}</>}
      />

      <CollectionView storageKey="programs:view" label="Programs" table={<RecordsTable label="Programs" columns={["Program", "Level", "Department", "Sections", "Subjects", "Semesters"]} rows={programs.map((p) => ({ id: p.id, cells: [<Link key="program" href={`/programs/${p.id}`} className="font-medium text-primary hover:underline">{p.code}<span className="block text-xs text-muted-foreground">{p.name}</span></Link>, p.level === "COLLEGE" ? "College" : "Senior High", p.department ?? "—", p.sections, p.subjects, p.terms] }))} />}>
      {departments.map((d) => {
        const own = programs.filter((p) => p.departmentId === d.id);
        return (
          <section key={d.id} aria-labelledby={`dept-${d.id}`} className="space-y-4">
            <div className="flex items-center gap-2 border-b pb-2">
              <h2 id={`dept-${d.id}`} className="text-xl font-semibold tracking-tight">{d.name}</h2>
            </div>
            {LEVELS.map(({ level, title, icon: Icon }) => {
              const items = own.filter((p) => p.level === level);
              // A level with nothing in scope is left out rather than shown empty.
              if (items.length === 0) return null;
              return (
                <div key={level} className="space-y-3">
                  <h3 className="flex items-center gap-2 text-base font-semibold">
                    <Icon className="size-5 text-primary" /> {title}
                    <Badge variant="secondary">{items.length}</Badge>
                  </h3>
                  <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 [&:has(>li:only-child)]:max-w-md">
                    {items.map((p) => (
                      <li key={p.id}>
                        <Link
                          href={`/programs/${p.id}`}
                          aria-label={`${p.code}, ${p.name}. Open details.`}
                          className="group block h-full rounded-xl border bg-card p-4 shadow-xs outline-none transition-shadow hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/60"
                        >
                          <p className="font-semibold">{p.code}</p>
                          <p className="line-clamp-2 text-sm text-muted-foreground">{p.name}</p>
                          {p.department && <p className="mt-1 truncate text-sm text-muted-foreground">{p.department}</p>}
                          <div className="mt-3 flex flex-wrap items-center gap-1.5">
                            <Badge variant="secondary">{p.sections} sections</Badge>
                            <Badge variant="secondary">{p.subjects} subjects</Badge>
                            {p.level === "COLLEGE" && <Badge variant="outline">{p.terms} own semesters</Badge>}
                            <ArrowRight className="ml-auto size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden />
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </section>
        );
      })}
      </CollectionView>

      {programs.length === 0 && <EmptyState title="No programs assigned to your department yet" description="Ask the Registrar to add programs to your department." />}

      <FormDialog
        open={!!renaming}
        onOpenChange={(o) => !o && setRenaming(null)}
        title="Rename department"
        description="Only the name changes. It updates everywhere it is shown."
        fields={[{ name: "name", label: "Department name", type: "text", required: true }]}
        values={{ name: renaming?.name ?? "" }}
        submitLabel="Save"
        successMessage="Department renamed"
        onSubmit={(fd) => renameDepartmentAction(renaming!.id, fd)}
      />
    </div>
  );
}
