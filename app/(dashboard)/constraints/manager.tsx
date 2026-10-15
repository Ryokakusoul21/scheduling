"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { PencilSimple, Plus, Trash } from "@phosphor-icons/react/ssr";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmDialog } from "@/components/ux/form-dialog";
import { NativeSelect } from "@/components/ux/native-select";
import { EmptyState, PageHeader } from "@/components/ux/states";
import { CONSTRAINT_INFO, CONSTRAINT_KINDS, LOCKED_KINDS, type ConstraintKind } from "@/lib/scheduler/constraints";
import { DAY_LONG, WEEK_DAYS, formatTime, timeOptions } from "@/lib/scheduler/timetable";
import { deleteConstraintAction, saveConstraintAction, toggleConstraintAction } from "./actions";

type Option = { value: string; label: string };
type Params = Record<string, unknown>;

export interface ConstraintRow {
  id: string;
  kind: ConstraintKind;
  name: string;
  params: Params;
  enabled: boolean;
  departmentId: string | null;
  department: string;
  editable: boolean;
}

/** Starting settings for a new constraint of each kind. */
const DEFAULT_PARAMS: Record<ConstraintKind, Params> = {
  NO_DOUBLE_BOOKING: {},
  ROOM_CAPACITY: {},
  ROOM_DESIGNATION: {},
  MAX_TEACHING_LOAD: { maxDailyHours: 8, maxWeeklyHours: 24 },
  PREFERRED_TIME: { facultyId: "", startMin: 8 * 60, endMin: 17 * 60, daysOff: [] },
  MAX_CONSECUTIVE: { maxConsecutive: 3, appliesTo: "FACULTY" },
  LUNCH_BREAK: { startMin: 12 * 60, endMin: 13 * 60 },
  SUBJECT_TIME_OF_DAY: { subjectId: "", period: "MORNING" },
  MINIMUM_GAP: { minutes: 15, appliesTo: "SECTION" },
};

const APPLIES_TO: Option[] = [
  { value: "FACULTY", label: "Each faculty member" },
  { value: "SECTION", label: "Each section" },
];

const TIMES = timeOptions().map((t) => ({ value: String(t.value), label: t.label }));

function summary(kind: ConstraintKind, p: Params, names: Map<string, string>) {
  const n = (v: unknown) => Number(v);
  switch (kind) {
    case "MAX_TEACHING_LOAD":
      return `At most ${n(p.maxDailyHours)} hours a day and ${n(p.maxWeeklyHours)} hours a week`;
    case "PREFERRED_TIME": {
      const off = (p.daysOff as string[]).map((d) => DAY_LONG[d as keyof typeof DAY_LONG]).join(", ");
      return `${names.get(String(p.facultyId)) ?? "Faculty member"}: ${formatTime(n(p.startMin))} to ${formatTime(n(p.endMin))}${off ? `; days off ${off}` : ""}`;
    }
    case "MAX_CONSECUTIVE":
      return `At most ${n(p.maxConsecutive)} back-to-back classes for ${p.appliesTo === "FACULTY" ? "each faculty member" : "each section"}`;
    case "LUNCH_BREAK":
      return `${formatTime(n(p.startMin))} to ${formatTime(n(p.endMin))}`;
    case "SUBJECT_TIME_OF_DAY":
      return `${names.get(String(p.subjectId)) ?? "Subject"} in the ${p.period === "MORNING" ? "morning" : "afternoon"}`;
    case "MINIMUM_GAP":
      return `At least ${n(p.minutes)} minutes between classes of ${p.appliesTo === "FACULTY" ? "each faculty member" : "each section"}`;
    default:
      return CONSTRAINT_INFO[kind].description;
  }
}

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
  const [editing, setEditing] = useState<ConstraintRow | "new" | null>(null);
  const [deleting, setDeleting] = useState<ConstraintRow | null>(null);
  const [, startTransition] = useTransition();
  const names = new Map([...faculty, ...subjects].map((o) => [o.value, o.label]));

  function toggle(row: ConstraintRow, enabled: boolean) {
    startTransition(async () => {
      const res = await toggleConstraintAction(row.id, enabled);
      if (!res.ok) toast.error(res.error);
    });
  }

  const groups = [true, false].map((hard) => ({ hard, rows: rows.filter((r) => CONSTRAINT_INFO[r.kind].hard === hard) }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Scheduling Constraints"
        description={
          isAdmin
            ? "Hard constraints block saving a class. Soft constraints show a warning that can be overridden. Every active constraint is checked on each change."
            : "Rules for your department. School-wide rules set by the Administrator are shown read-only."
        }
        actions={
          <Button onClick={() => setEditing("new")}>
            <Plus className="size-4" /> Add constraint
          </Button>
        }
      />

      {groups.map((g) => (
        <section key={String(g.hard)} className="space-y-2">
          <h2 className="text-lg font-semibold">{g.hard ? "Hard constraints" : "Soft constraints"}</h2>
          <Card>
            <CardContent className="p-0">
              {g.rows.length === 0 ? (
                <EmptyState title={`No ${g.hard ? "hard" : "soft"} constraints`} description="Add one with the button above." className="border-0 py-8" />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Constraint</TableHead>
                      <TableHead>Settings</TableHead>
                      <TableHead>Applies to</TableHead>
                      <TableHead>Active</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {g.rows.map((r) => {
                      const locked = LOCKED_KINDS.includes(r.kind);
                      return (
                        <TableRow key={r.id}>
                          <TableCell>
                            <p className="font-medium">{r.name}</p>
                            <p className="text-xs text-muted-foreground">{CONSTRAINT_INFO[r.kind].label}</p>
                          </TableCell>
                          <TableCell className="max-w-sm whitespace-normal text-sm">{summary(r.kind, r.params, names)}</TableCell>
                          <TableCell>{r.department}</TableCell>
                          <TableCell>
                            {locked ? (
                              <Badge variant="secondary">Always on</Badge>
                            ) : (
                              <Switch checked={r.enabled} disabled={!r.editable} onCheckedChange={(v) => toggle(r, v)} aria-label={`Turn ${r.name} on or off`} />
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {r.editable && !locked && (
                              <div className="flex justify-end gap-1">
                                <Button size="icon-sm" variant="ghost" onClick={() => setEditing(r)} aria-label={`Edit ${r.name}`}>
                                  <PencilSimple className="size-4" />
                                </Button>
                                <Button size="icon-sm" variant="ghost" onClick={() => setDeleting(r)} aria-label={`Delete ${r.name}`}>
                                  <Trash className="size-4" />
                                </Button>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </section>
      ))}

      <ConstraintDialog
        key={editing === "new" ? "new" : editing?.id}
        row={editing}
        onClose={() => setEditing(null)}
        isAdmin={isAdmin}
        departments={departments}
        faculty={faculty}
        subjects={subjects}
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete this constraint?"
        description={`"${deleting?.name}" will no longer be checked.`}
        onConfirm={() => deleteConstraintAction(deleting!.id)}
        successMessage="Constraint deleted"
      />
    </div>
  );
}

function ConstraintDialog({
  row,
  onClose,
  isAdmin,
  departments,
  faculty,
  subjects,
}: {
  row: ConstraintRow | "new" | null;
  onClose: () => void;
  isAdmin: boolean;
  departments: Option[];
  faculty: Option[];
  subjects: Option[];
}) {
  const existing = row && row !== "new" ? row : null;
  const [kind, setKind] = useState<ConstraintKind>(existing?.kind ?? "LUNCH_BREAK");
  const [name, setName] = useState(existing?.name ?? CONSTRAINT_INFO.LUNCH_BREAK.label);
  const [params, setParams] = useState<Params>(existing?.params ?? DEFAULT_PARAMS.LUNCH_BREAK);
  const [departmentId, setDepartmentId] = useState(existing?.departmentId ?? "");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const set = (key: string, value: unknown) => setParams((p) => ({ ...p, [key]: value }));
  const num = (key: string) => String(params[key] ?? "");

  function changeKind(next: ConstraintKind) {
    setKind(next);
    setParams(DEFAULT_PARAMS[next]);
    setName(CONSTRAINT_INFO[next].label);
  }

  function save() {
    setError("");
    startTransition(async () => {
      const res = await saveConstraintAction(existing?.id ?? null, { kind, name, params, departmentId: departmentId || null, enabled: existing?.enabled ?? true });
      if (!res.ok) return setError(res.error ?? "Could not save.");
      toast.success(existing ? "Constraint updated" : "Constraint added");
      onClose();
    });
  }

  const timeField = (key: string, label: string) => (
    <Field>
      <FieldLabel htmlFor={`c-${key}`}>{label}</FieldLabel>
      <NativeSelect id={`c-${key}`} value={num(key)} onChange={(e) => set(key, Number(e.target.value))} options={TIMES} />
    </Field>
  );
  const numberField = (key: string, label: string, min: number, max: number, step = 1) => (
    <Field>
      <FieldLabel htmlFor={`c-${key}`}>{label}</FieldLabel>
      <Input id={`c-${key}`} type="number" min={min} max={max} step={step} value={num(key)} onChange={(e) => set(key, Number(e.target.value))} />
    </Field>
  );
  const selectField = (key: string, label: string, options: Option[], placeholder?: string) => (
    <Field>
      <FieldLabel htmlFor={`c-${key}`}>{label}</FieldLabel>
      <NativeSelect id={`c-${key}`} value={String(params[key] ?? "")} onChange={(e) => set(key, e.target.value)} options={options} placeholder={placeholder} />
    </Field>
  );

  const creatable = CONSTRAINT_KINDS.filter((k) => !LOCKED_KINDS.includes(k));

  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{existing ? "Edit constraint" : "Add constraint"}</DialogTitle>
          <DialogDescription>{CONSTRAINT_INFO[kind].description}</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="c-kind">Type</FieldLabel>
            <NativeSelect
              id="c-kind"
              value={kind}
              onChange={(e) => changeKind(e.target.value as ConstraintKind)}
              groups={[true, false].map((hard) => ({
                label: hard ? "Hard (blocks saving)" : "Soft (warning, can be overridden)",
                options: creatable.filter((k) => CONSTRAINT_INFO[k].hard === hard).map((k) => ({ value: k, label: CONSTRAINT_INFO[k].label })),
              }))}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="c-name">Name</FieldLabel>
            <Input id="c-name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          {isAdmin && (
            <Field>
              <FieldLabel htmlFor="c-department">Applies to</FieldLabel>
              <NativeSelect id="c-department" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} options={departments} placeholder="Every department" />
              <FieldDescription>A department rule only checks classes of that department&apos;s sections.</FieldDescription>
            </Field>
          )}

          {kind === "MAX_TEACHING_LOAD" && (
            <div className="grid gap-4 sm:grid-cols-2">
              {numberField("maxDailyHours", "Maximum hours a day", 1, 24, 0.5)}
              {numberField("maxWeeklyHours", "Maximum hours a week", 1, 168, 0.5)}
            </div>
          )}
          {kind === "PREFERRED_TIME" && (
            <>
              {selectField("facultyId", "Faculty member", faculty, "Choose a faculty member")}
              <div className="grid gap-4 sm:grid-cols-2">
                {timeField("startMin", "Preferred start")}
                {timeField("endMin", "Preferred end")}
              </div>
              <fieldset>
                <legend className="mb-2 text-sm font-medium">Days off</legend>
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  {WEEK_DAYS.map((d) => {
                    const off = (params.daysOff as string[]) ?? [];
                    return (
                      <label key={d} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="size-4 accent-primary"
                          checked={off.includes(d)}
                          onChange={(e) => set("daysOff", e.target.checked ? [...off, d] : off.filter((x) => x !== d))}
                        />
                        {DAY_LONG[d]}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            </>
          )}
          {kind === "MAX_CONSECUTIVE" && (
            <div className="grid gap-4 sm:grid-cols-2">
              {numberField("maxConsecutive", "Maximum back-to-back classes", 1, 12)}
              {selectField("appliesTo", "Check for", APPLIES_TO)}
            </div>
          )}
          {kind === "LUNCH_BREAK" && (
            <div className="grid gap-4 sm:grid-cols-2">
              {timeField("startMin", "Lunch starts")}
              {timeField("endMin", "Lunch ends")}
            </div>
          )}
          {kind === "SUBJECT_TIME_OF_DAY" && (
            <div className="grid gap-4 sm:grid-cols-2">
              {selectField("subjectId", "Subject", subjects, "Choose a subject")}
              {selectField("period", "Preferred time of day", [
                { value: "MORNING", label: "Morning (ends by 12:00 noon)" },
                { value: "AFTERNOON", label: "Afternoon (starts at 12:00 noon or later)" },
              ])}
            </div>
          )}
          {kind === "MINIMUM_GAP" && (
            <div className="grid gap-4 sm:grid-cols-2">
              {numberField("minutes", "Minimum gap in minutes", 5, 240, 5)}
              {selectField("appliesTo", "Check for", APPLIES_TO)}
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </FieldGroup>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={pending}>
            {pending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
