"use client";

import { useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { CalendarBlank, DotsThree, PencilSimple, Plus, Star, Trash } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { CardGrid } from "@/components/ux/card-grid";
import { EmptyState, PageHeader } from "@/components/ux/states";
import { ConfirmDialog, FormDialog, useDialogState, type FormField } from "@/components/ux/form-dialog";
import { useShortcut } from "@/components/ux/shortcuts";
import { cn } from "@/lib/utils";
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

export function YearsManager({ years }: { years: Year[] }) {
  const dialog = useDialogState<Year>();
  const del = useDialogState<Year>();
  const [, startTransition] = useTransition();

  useShortcut({ keys: "n", description: "New academic year", group: "Academic years", handler: dialog.openCreate });

  const editing = dialog.state?.mode === "edit" ? dialog.state.item : null;
  const deleting = del.state?.mode === "edit" ? del.state.item : null;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Academic Years & Terms"
        description="Create or select an academic year, then set up semesters per course (College) and quarters (SHS, JHS, Elementary)."
        actions={
          <Button onClick={dialog.openCreate} aria-keyshortcuts="n">
            <Plus className="size-4" /> New academic year
          </Button>
        }
      />

      {years.length === 0 ? (
        <EmptyState
          icon={CalendarBlank}
          title="No academic years yet"
          description="Create the first academic year to start setting up terms."
          action={<Button onClick={dialog.openCreate}>Create academic year</Button>}
        />
      ) : (
        <CardGrid label="Academic years">
          {years.map((y) => (
            <div
              key={y.id}
              className={cn(
                "group relative rounded-xl border bg-card p-4 shadow-xs transition-all hover:-translate-y-0.5 hover:shadow-md",
                y.isActive && "border-primary ring-2 ring-primary/20"
              )}
            >
              <Link
                href={`/academic-years/${y.id}`}
                data-roving=""
                tabIndex={-1}
                className="block rounded-lg outline-none after:absolute after:inset-0 after:rounded-xl"
                aria-label={`Academic year ${y.name}${y.isActive ? ", active" : ""}. ${y.termCount} terms. Open to manage terms.`}
              >
                <div className="flex items-center gap-3">
                  <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <CalendarBlank className="size-5" />
                  </span>
                  <div>
                    <p className="text-lg font-semibold">A.Y. {y.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {fmt(y.startDate)} – {fmt(y.endDate)}
                    </p>
                  </div>
                </div>
              </Link>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {y.isActive && <Badge>Active</Badge>}
                <Badge variant="secondary">{y.termCount} terms</Badge>
                <Badge variant="outline">{y.levelsConfigured}/4 levels set up</Badge>
              </div>
              <div className="absolute top-3 right-3 z-10">
                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${y.name}`} />}>
                    <DotsThree className="size-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => dialog.openEdit(y)}>
                      <PencilSimple className="size-4" /> Edit
                    </DropdownMenuItem>
                    {!y.isActive && (
                      <DropdownMenuItem
                        onClick={() =>
                          startTransition(async () => {
                            await setActiveAcademicYearAction(y.id);
                            toast.success(`${y.name} is now the active academic year`);
                          })
                        }
                      >
                        <Star className="size-4" /> Set as active
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onClick={() => del.openEdit(y)}>
                      <Trash className="size-4" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          ))}
        </CardGrid>
      )}

      <FormDialog
        open={!!dialog.state}
        onOpenChange={(o) => !o && dialog.close()}
        title={editing ? `Edit A.Y. ${editing.name}` : "New academic year"}
        fields={FIELDS}
        values={editing ?? {}}
        submitLabel={editing ? "Save changes" : "Create"}
        successMessage={editing ? "Academic year updated" : "Academic year created"}
        onSubmit={(fd) => saveAcademicYearAction(editing?.id ?? null, fd)}
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && del.close()}
        title={`Delete A.Y. ${deleting?.name ?? ""}?`}
        description="This can only be done when the academic year has no terms."
        successMessage="Academic year deleted"
        onConfirm={() => deleteAcademicYearAction(deleting!.id)}
      />
    </div>
  );
}
