"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowSquareOut, Buildings, Plus, Trash } from "@phosphor-icons/react/ssr";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { assignDepartmentHeadAction, removeDepartmentHeadAssignmentAction, saveDepartmentAction } from "./actions";

type Department = {
  id: string;
  code: string;
  name: string;
  counts: { programs: number; faculty: number; sections: number; rooms: number };
  heads: { id: string; name: string; email: string; acting: boolean; linkedThroughFaculty: boolean }[];
};

export function DepartmentManager({ departments, headOptions }: { departments: Department[]; headOptions: { id: string; label: string }[] }) {
  const [pending, startTransition] = useTransition();
  const [selectedHeads, setSelectedHeads] = useState<Record<string, string>>({});

  function save(id: string | null, formData: FormData) {
    startTransition(async () => {
      const result = await saveDepartmentAction(id, formData);
      if (result.ok) toast.success(id ? "Department details saved." : "Department created.");
      else toast.error(result.error);
    });
  }

  function assign(departmentId: string) {
    const userId = selectedHeads[departmentId];
    if (!userId) {
      toast.error("Choose an active Head of Department.");
      return;
    }
    startTransition(async () => {
      const result = await assignDepartmentHeadAction(departmentId, userId);
      if (result.ok) {
        toast.success("Head of Department assigned.");
        setSelectedHeads((current) => ({ ...current, [departmentId]: "" }));
      } else toast.error(result.error);
    });
  }

  function remove(departmentId: string, userId: string) {
    startTransition(async () => {
      const result = await removeDepartmentHeadAssignmentAction(departmentId, userId);
      if (result.ok) toast.success("Department assignment removed.");
      else toast.error(result.error);
    });
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Plus className="size-5 text-primary" /> Add a department</CardTitle></CardHeader>
        <CardContent>
          <form action={(formData) => save(null, formData)}>
            <FieldGroup className="grid gap-3 sm:grid-cols-[minmax(8rem,0.5fr)_minmax(14rem,1.5fr)_auto] sm:items-end">
              <Field>
                <FieldLabel htmlFor="new-department-code">Department code</FieldLabel>
                <Input id="new-department-code" name="code" maxLength={20} required placeholder="SCI" />
              </Field>
              <Field>
                <FieldLabel htmlFor="new-department-name">Department name</FieldLabel>
                <Input id="new-department-name" name="name" maxLength={150} required placeholder="College of Science" />
              </Field>
              <Button type="submit" disabled={pending}><Plus className="size-4" /> Create department</Button>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>

      <section className="space-y-3" aria-label="Departments">
        <h2 className="text-lg font-semibold">Departments <span className="text-sm font-normal text-muted-foreground">({departments.length})</span></h2>
        {departments.length === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No departments yet. Create one to begin organizing academic records.</p>
        ) : departments.map((department) => (
          <Card key={department.id}>
            <CardContent className="grid gap-5 pt-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(18rem,1fr)]">
              <div className="space-y-4">
                <form action={(formData) => save(department.id, formData)}>
                  <FieldGroup className="grid gap-3 sm:grid-cols-[minmax(7rem,0.45fr)_minmax(14rem,1.55fr)_auto] sm:items-end">
                    <Field>
                      <FieldLabel htmlFor={`code-${department.id}`}>Department code</FieldLabel>
                      <Input id={`code-${department.id}`} name="code" defaultValue={department.code} maxLength={20} required />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor={`name-${department.id}`}>Department name</FieldLabel>
                      <Input id={`name-${department.id}`} name="name" defaultValue={department.name} maxLength={150} required />
                    </Field>
                    <Button type="submit" variant="outline" disabled={pending}>Save details</Button>
                  </FieldGroup>
                </form>

                <div className="flex flex-wrap gap-2" aria-label={`${department.name} record counts`}>
                  <Badge variant="secondary">{department.counts.programs} programs</Badge>
                  <Badge variant="secondary">{department.counts.faculty} faculty records</Badge>
                  <Badge variant="secondary">{department.counts.sections} sections</Badge>
                  <Badge variant="secondary">{department.counts.rooms} rooms</Badge>
                  <Link href={`/analytics?department=${encodeURIComponent(department.id)}`} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                    Department analytics <ArrowSquareOut className="size-3.5" />
                  </Link>
                </div>
              </div>

              <div className="space-y-3 rounded-lg border p-3">
                <div className="flex items-center gap-2 font-medium"><Buildings className="size-4 text-primary" /> Head of Department</div>
                {department.heads.length ? (
                  <ul className="space-y-2">
                    {department.heads.map((head) => (
                      <li key={head.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                        <span className="min-w-0">
                          <span className="block font-medium">{head.name}{head.acting ? " · Acting" : ""}</span>
                          <span className="block truncate text-xs text-muted-foreground">{head.email}</span>
                        </span>
                        {!head.linkedThroughFaculty && (
                          <Button type="button" size="icon-sm" variant="ghost" disabled={pending} aria-label={`Remove ${head.name} from ${department.name}`} onClick={() => remove(department.id, head.id)}>
                            <Trash className="size-4" />
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : <p className="text-sm text-muted-foreground">No active Head of Department is assigned.</p>}

                <div className="flex flex-col gap-2 sm:flex-row">
                  <select
                    aria-label={`Select Head of Department for ${department.name}`}
                    className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm"
                    value={selectedHeads[department.id] ?? ""}
                    onChange={(event) => setSelectedHeads((current) => ({ ...current, [department.id]: event.target.value }))}
                    disabled={pending || headOptions.length === 0}
                  >
                    <option value="">{headOptions.length ? "Choose an active Head of Department" : "No active Head of Department accounts"}</option>
                    {headOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                  </select>
                  <Button type="button" variant="outline" disabled={pending || !selectedHeads[department.id]} onClick={() => assign(department.id)}>Assign</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>
      <p className="text-xs text-muted-foreground">Departments with linked academic records cannot be deleted here. Only existing active Head of Department accounts can be assigned; all assignment changes are audited.</p>
    </div>
  );
}
