"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { CalendarPlus, DotsThree, PencilSimple, Plus, Star, Trash, Sparkle } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ConfirmDialog, FormDialog, useDialogState, type FormField } from "@/components/ux/form-dialog";
import { useShortcut } from "@/components/ux/shortcuts";
import { LEVELS, termLabel, termTypesFor, type AcademicLevel } from "@/lib/academics/levels";
import { cn } from "@/lib/utils";
import { createDefaultTermsAction, deleteTermAction, saveTermAction, setActiveTermAction } from "../actions";

interface Term {
  id: string;
  type: string;
  programId: string | null;
  startDate: string;
  endDate: string;
  isActive: boolean;
  classes: number;
}

interface Program {
  id: string;
  code: string;
  name: string;
  department: string | null;
}

type Target = { term?: Term; programId: string | null };

function fmt(d: string) {
  return new Date(d).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

export function TermsManager({
  year,
  level,
  programs,
  terms,
}: {
  year: { id: string; name: string; startDate: string; endDate: string };
  level: AcademicLevel;
  programs: Program[];
  terms: Term[];
}) {
  const dialog = useDialogState<Target>();
  const del = useDialogState<Term>();
  const [pending, startTransition] = useTransition();
  const types = termTypesFor(level);
  const isCollege = LEVELS[level].termKind === "semester";

  const target = dialog.state?.mode === "edit" ? dialog.state.item : null;
  const deleting = del.state?.mode === "edit" ? del.state.item : null;

  useShortcut({
    keys: "n",
    description: isCollege ? "Add a shared semester" : "Add a quarter",
    group: "Terms",
    handler: () => dialog.openEdit({ programId: null }),
  });

  function createDefaults(programId: string | null) {
    startTransition(async () => {
      const res = await createDefaultTermsAction(year.id, level, programId);
      if (res.ok) toast.success(isCollege ? "Semesters created" : "Quarters created");
      else toast.error(res.error);
    });
  }

  function setActive(t: Term) {
    startTransition(async () => {
      await setActiveTermAction(t.id);
      toast.success(`${termLabel(t.type)} is now active`);
    });
  }

  const fields: FormField[] = [
    { name: "academicYearId", label: "", type: "hidden" },
    { name: "level", label: "", type: "hidden" },
    { name: "programId", label: "", type: "hidden" },
    { name: "type", label: isCollege ? "Semester" : "Quarter", type: "select", required: true, options: types.map((t) => ({ value: t, label: termLabel(t) })) },
    { name: "startDate", label: "Start date", type: "date", required: true },
    { name: "endDate", label: "End date", type: "date", required: true },
    { name: "isActive", label: "Make this the active term", type: "checkbox" },
  ];

  const groups: { programId: string | null; title: string; subtitle: string }[] = isCollege
    ? [
        { programId: null, title: "All courses (shared)", subtitle: "Used by any course without its own semesters" },
        ...programs.map((p) => ({ programId: p.id, title: p.code, subtitle: `${p.name}${p.department ? ` · ${p.department}` : ""}` })),
      ]
    : [{ programId: null, title: `${LEVELS[level].label} quarters`, subtitle: "Grading periods for every grade in this level" }];

  return (
    <section aria-label="Terms" className="space-y-3">
      <div className={cn("grid gap-3", isCollege ? "md:grid-cols-2 xl:grid-cols-3" : "")}>
        {groups.map((g) => {
          const list = terms.filter((t) => t.programId === g.programId).sort((a, b) => types.indexOf(a.type as never) - types.indexOf(b.type as never));
          const missing = types.length - list.length;
          return (
            <Card key={g.programId ?? "shared"} className={cn(g.programId === null && isCollege && "border-primary/40")}>
              <CardHeader className="flex-row items-start justify-between gap-2 space-y-0">
                <div>
                  <CardTitle className="text-base">{g.title}</CardTitle>
                  <CardDescription>{g.subtitle}</CardDescription>
                </div>
                <Button size="sm" variant="outline" onClick={() => dialog.openEdit({ programId: g.programId })} aria-label={`Add term to ${g.title}`}>
                  <Plus className="size-3.5" /> Add
                </Button>
              </CardHeader>
              <CardContent className="space-y-2">
                {list.length === 0 && (
                  <p className="rounded-md border border-dashed p-3 text-center text-sm text-muted-foreground">
                    {g.programId && isCollege ? "Uses the shared semesters." : "No terms yet."}
                  </p>
                )}
                <ul className={cn(isCollege ? "space-y-2" : "grid gap-2 sm:grid-cols-2 xl:grid-cols-4")}>
                  {list.map((t) => (
                    <li
                      key={t.id}
                      className={cn("flex items-start justify-between gap-2 rounded-lg border p-3", t.isActive && "border-primary bg-primary/5")}
                    >
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 font-medium">
                          {termLabel(t.type)} {t.isActive && <Badge>Active</Badge>}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {fmt(t.startDate)} – {fmt(t.endDate)}
                        </p>
                        <p className="text-xs text-muted-foreground">{t.classes} scheduled classes</p>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${termLabel(t.type)}`} />}>
                          <DotsThree className="size-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => dialog.openEdit({ term: t, programId: t.programId })}>
                            <PencilSimple className="size-4" /> Edit dates
                          </DropdownMenuItem>
                          {!t.isActive && (
                            <DropdownMenuItem onClick={() => setActive(t)}>
                              <Star className="size-4" /> Set as active
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem variant="destructive" onClick={() => del.openEdit(t)}>
                            <Trash className="size-4" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </li>
                  ))}
                </ul>
                {missing > 0 && (
                  <Button variant="ghost" size="sm" disabled={pending} onClick={() => createDefaults(g.programId)} className="text-primary">
                    {isCollege ? <CalendarPlus className="size-4" /> : <Sparkle className="size-4" />}
                    {isCollege ? `Create ${list.length ? "missing" : "First, Second & Summer"} semesters` : `Create ${list.length ? "missing" : "all 4"} quarters`}
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <FormDialog
        open={!!dialog.state}
        onOpenChange={(o) => !o && dialog.close()}
        title={target?.term ? `Edit ${termLabel(target.term.type)}` : isCollege ? "Add semester" : "Add quarter"}
        description={`A.Y. ${year.name} · ${LEVELS[level].label}${target?.programId ? ` · ${programs.find((p) => p.id === target.programId)?.code}` : ""}`}
        fields={fields}
        values={{
          academicYearId: year.id,
          level,
          programId: target?.programId ?? "",
          type: target?.term?.type ?? types.find((t) => !terms.some((x) => x.type === t && x.programId === (target?.programId ?? null))) ?? types[0],
          startDate: target?.term?.startDate ?? year.startDate,
          endDate: target?.term?.endDate ?? year.endDate,
          isActive: target?.term?.isActive ?? false,
        }}
        submitLabel={target?.term ? "Save" : "Add"}
        successMessage={target?.term ? "Term updated" : "Term added"}
        onSubmit={(fd) => saveTermAction(target?.term?.id ?? null, fd)}
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && del.close()}
        title={`Delete ${deleting ? termLabel(deleting.type) : "term"}?`}
        description="Terms with scheduled classes or assigned sections can't be deleted."
        successMessage="Term deleted"
        onConfirm={() => deleteTermAction(deleting!.id)}
      />
    </section>
  );
}
