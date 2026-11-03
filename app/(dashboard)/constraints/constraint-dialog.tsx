"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ux/native-select";
import { CONSTRAINT_INFO, type ConstraintKind } from "@/lib/scheduler/constraints";
import { DAY_LONG, WEEK_DAYS, timeOptions } from "@/lib/scheduler/timetable";
import { cn } from "@/lib/utils";
import { CREATE_CATEGORIES, DEFAULT_PARAMS, createCategoryOf, type ConstraintRow, type CreateCategory, type Params } from "./categories";
import { saveConstraintAction } from "./actions";

type Option = { value: string; label: string };

const TIMES = timeOptions().map((t) => ({ value: String(t.value), label: t.label }));

/** Default settings for a kind, with "applies to" following the chosen category. */
function paramsFor(kind: ConstraintKind, category: CreateCategory): Params {
  const p = DEFAULT_PARAMS[kind];
  return "appliesTo" in p ? { ...p, appliesTo: category === "faculty" ? "FACULTY" : "SECTION" } : p;
}

/** Add or edit a rule: pick the category first, then only that category's types and fields. */
export function ConstraintDialog({
  row,
  initialCategory,
  onClose,
  isAdmin,
  departments,
  faculty,
  subjects,
}: {
  row: ConstraintRow | "new" | null;
  initialCategory: CreateCategory;
  onClose: () => void;
  isAdmin: boolean;
  departments: Option[];
  faculty: Option[];
  subjects: Option[];
}) {
  const existing = row && row !== "new" ? row : null;
  const startCategory = existing ? createCategoryOf(existing) : initialCategory;
  const startKind = existing?.kind ?? CREATE_CATEGORIES.find((c) => c.value === startCategory)!.kinds[0];
  const [category, setCategory] = useState<CreateCategory>(startCategory);
  const [kind, setKind] = useState<ConstraintKind>(startKind);
  const [name, setName] = useState(existing?.name ?? CONSTRAINT_INFO[startKind].label);
  const [params, setParams] = useState<Params>(existing?.params ?? paramsFor(startKind, startCategory));
  const [departmentId, setDepartmentId] = useState(existing?.departmentId ?? "");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const kinds = CREATE_CATEGORIES.find((c) => c.value === category)!.kinds;
  const set = (key: string, value: unknown) => setParams((p) => ({ ...p, [key]: value }));
  const num = (key: string) => String(params[key] ?? "");
  // The name follows the type until the user types their own.
  const autoName = name === CONSTRAINT_INFO[kind].label || name.endsWith(": preferred time and days off");

  function choose(nextCategory: CreateCategory, nextKind: ConstraintKind) {
    setCategory(nextCategory);
    setKind(nextKind);
    setParams(paramsFor(nextKind, nextCategory));
    if (autoName) setName(CONSTRAINT_INFO[nextKind].label);
  }

  function save() {
    setError("");
    startTransition(async () => {
      const res = await saveConstraintAction(existing?.id ?? null, { kind, name, params, departmentId: departmentId || null, enabled: existing?.enabled ?? true });
      if (!res.ok) return setError(res.error ?? "Could not save.");
      toast.success(existing ? `${name} updated` : `${name} added`);
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
  const selectField = (key: string, label: string, options: Option[], placeholder?: string, onPick?: (value: string) => void) => (
    <Field>
      <FieldLabel htmlFor={`c-${key}`}>{label}</FieldLabel>
      <NativeSelect
        id={`c-${key}`}
        value={String(params[key] ?? "")}
        onChange={(e) => {
          set(key, e.target.value);
          onPick?.(e.target.value);
        }}
        options={options}
        placeholder={placeholder}
      />
    </Field>
  );

  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{existing ? `Edit ${existing.name}` : "Add constraint"}</DialogTitle>
          <DialogDescription>{CONSTRAINT_INFO[kind].description}</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          {!existing && (
            <fieldset className="space-y-2">
              <legend className="mb-2 text-sm font-medium">What kind of rule?</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {CREATE_CATEGORIES.map((c) => (
                  <label
                    key={c.value}
                    className={cn(
                      "flex cursor-pointer flex-col gap-0.5 rounded-lg border p-3 text-sm transition-colors duration-150 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                      category === c.value ? "border-primary bg-primary/5" : "hover:bg-muted"
                    )}
                  >
                    <input type="radio" name="category" className="sr-only" checked={category === c.value} onChange={() => choose(c.value, c.kinds[0])} />
                    <span className="font-medium">{c.label}</span>
                    <span className="text-[13px] text-muted-foreground">{c.description}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {kinds.length > 1 && (
            <Field>
              <FieldLabel htmlFor="c-kind">Type</FieldLabel>
              <NativeSelect
                id="c-kind"
                value={kind}
                onChange={(e) => choose(category, e.target.value as ConstraintKind)}
                options={kinds.map((k) => ({ value: k, label: `${CONSTRAINT_INFO[k].label} (${CONSTRAINT_INFO[k].hard ? "Required" : "Preferred"})` }))}
              />
            </Field>
          )}
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
              {selectField("facultyId", "Faculty member", faculty, "Choose a faculty member", (id) => {
                const who = faculty.find((f) => f.value === id)?.label;
                if (who && autoName) setName(`${who}: preferred time and days off`);
              })}
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
          {kind === "MAX_CONSECUTIVE" && numberField("maxConsecutive", `Maximum back-to-back classes for ${params.appliesTo === "FACULTY" ? "each faculty member" : "each section"}`, 1, 12)}
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
          {kind === "MINIMUM_GAP" && numberField("minutes", `Minimum gap in minutes for ${params.appliesTo === "FACULTY" ? "each faculty member" : "each section"}`, 5, 240, 5)}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
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
