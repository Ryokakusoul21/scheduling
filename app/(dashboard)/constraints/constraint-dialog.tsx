"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Buildings, CalendarBlank, Clock, UserCircle } from "@phosphor-icons/react/ssr";
import { StrengthBadge } from "./rule-row";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ux/native-select";
import { availableDaysOf, CONSTRAINT_INFO, type ConstraintKind } from "@/lib/scheduler/constraints";
import { DAY_LONG, WEEK_DAYS, timeOptions } from "@/lib/scheduler/timetable";
import { cn } from "@/lib/utils";
import { CREATE_CATEGORIES, DEFAULT_PARAMS, createCategoryOf, type ConstraintRow, type CreateCategory, type Params } from "./categories";
import { PolicyWizard } from "./policy-wizard";
import { ClassPolicyFields, type PolicyOptions } from "./class-policy-fields";
import { isClassPolicy } from "@/lib/scheduler/class-policies";
import { previewConstraintAction, saveConstraintAction } from "./actions";

type Option = { value: string; label: string; partTime?: boolean };

const CATEGORY_ICONS = { faculty: UserCircle, preference: Clock, schedule: CalendarBlank, rooms: Buildings } as const;

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
  rooms,
  subjects,
  policyOptions,
}: {
  row: ConstraintRow | "new" | null;
  initialCategory: CreateCategory;
  onClose: () => void;
  isAdmin: boolean;
  departments: Option[];
  faculty: Option[];
  rooms: Option[];
  subjects: Option[];
  policyOptions: PolicyOptions;
}) {
  const existing = row && row !== "new" ? row : null;
  const startCategory = existing ? createCategoryOf(existing) : initialCategory;
  const startKind = existing?.kind ?? (startCategory === "schedule" ? "DELIVERY_MODE" : CREATE_CATEGORIES.find((c) => c.value === startCategory)!.kinds[0]);
  const [category, setCategory] = useState<CreateCategory>(startCategory);
  const [kind, setKind] = useState<ConstraintKind>(startKind);
  const [name, setName] = useState(existing?.name ?? CONSTRAINT_INFO[startKind].label);
  const [params, setParams] = useState<Params>(existing?.params ?? paramsFor(startKind, startCategory));
  const [departmentId, setDepartmentId] = useState(existing?.departmentId ?? "");
  const [preview, setPreview] = useState<Extract<Awaited<ReturnType<typeof previewConstraintAction>>, { ok: true }> | null>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const kinds = CREATE_CATEGORIES.find((c) => c.value === category)!.kinds;
  const set = (key: string, value: unknown) => { setParams((p) => ({ ...p, [key]: value })); setPreview(null); };
  const num = (key: string) => String(params[key] ?? "");
  // The name follows the type until the user types their own.
  const autoName = name === CONSTRAINT_INFO[kind].label || name.endsWith(": preferred time and days off") || name.startsWith("Room priority: ");

  function choose(nextCategory: CreateCategory, nextKind: ConstraintKind) {
    setPreview(null);
    setCategory(nextCategory);
    setKind(nextKind);
    setParams(paramsFor(nextKind, nextCategory));
    if (autoName) setName(CONSTRAINT_INFO[nextKind].label);
  }

  /** Names a Room priority rule after its room and faculty member until the user renames it. */
  function priorityName(next: Params) {
    const room = rooms.find((r) => r.value === next.roomId)?.label;
    const who = faculty.find((f) => f.value === next.facultyId)?.label;
    if (autoName && room && who) setName(`Room priority: ${room.split(" · ")[0]} for ${who}`);
  }

  function save() {
    setError("");
    startTransition(async () => {
      const res = await saveConstraintAction(existing?.id || null, { kind, name, params, departmentId: departmentId || null, enabled: existing?.enabled ?? true, previewToken: preview?.token });
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

  if (isClassPolicy(kind)) return <PolicyWizard row={existing} initialKind={kind as "CLASS_DURATION" | "DELIVERY_MODE"} initialParams={params} initialName={name} options={policyOptions} isAdmin={isAdmin} onClose={onClose} onOtherRules={() => choose("schedule", "LUNCH_BREAK")} />;

  const info = CONSTRAINT_INFO[kind];
  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] gap-0 overflow-y-auto p-0 sm:max-w-xl">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle>{existing ? `Edit ${existing.name}` : "Add constraint"}</DialogTitle>
          <DialogDescription className="sr-only">{info.description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-5 px-5 py-4">
          {!existing && (
            <fieldset>
              <legend className="sr-only">Rule category</legend>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {CREATE_CATEGORIES.map((c) => {
                  const Icon = CATEGORY_ICONS[c.value];
                  return (
                    <label key={c.value} className={cn("flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border p-3 text-center text-xs font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                      category === c.value ? "border-primary bg-primary/5 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
                      <input type="radio" name="category" className="sr-only" checked={category === c.value} onChange={() => choose(c.value, c.kinds[0])} />
                      <Icon className="size-5" weight={category === c.value ? "fill" : "regular"} aria-hidden />
                      {c.short}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          )}

          {kinds.length > 1 && (
            <div role="radiogroup" aria-label="Type" className="flex flex-wrap gap-1.5">
              {kinds.map((k) => (
                <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => choose(category, k)}
                  className={cn("inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors",
                    kind === k ? "border-foreground bg-foreground text-background" : "hover:bg-muted")}>
                  <span className={cn("size-1.5 rounded-full", CONSTRAINT_INFO[k].hard ? "bg-info" : "bg-muted-foreground/60")} aria-hidden />
                  {CONSTRAINT_INFO[k].label}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-start gap-2 text-[13px] text-muted-foreground"><StrengthBadge hard={info.hard} /><span className="pt-0.5">{info.description}</span></div>

          <div className="space-y-4 rounded-xl border bg-muted/30 p-4">
            {kind === "MAX_TEACHING_LOAD" && (
              <div className="grid gap-4 sm:grid-cols-2">
                {numberField("maxDailyHours", "Hours a day", 1, 24, 0.5)}
                {numberField("maxWeeklyHours", "Hours a week", 1, 168, 0.5)}
              </div>
            )}
            {kind === "PREFERRED_TIME" && (
              <>
                {selectField("facultyId", "Part-time faculty member", faculty.filter((f) => f.partTime), "Choose a part-time faculty member", (id) => {
                  const who = faculty.find((f) => f.value === id)?.label;
                  if (who && autoName) setName(`${who}: available days and hours`);
                })}
                <div className="grid gap-4 sm:grid-cols-2">
                  {timeField("startMin", "From")}
                  {timeField("endMin", "To")}
                </div>
                <fieldset>
                  <legend className="mb-2 text-sm font-medium">Available days</legend>
                  <div className="flex flex-wrap gap-1.5">
                    {WEEK_DAYS.filter((d) => d !== "SUNDAY").map((d) => {
                      const days: string[] = availableDaysOf(params);
                      const on = days.includes(d);
                      return (
                        <button key={d} type="button" aria-pressed={on} onClick={() => set("availableDays", on ? days.filter((x) => x !== d) : [...days, d])}
                          className={cn("h-8 rounded-full border px-3 text-xs font-medium", on ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted")}>
                          {DAY_LONG[d]}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              </>
            )}
            {kind === "MAX_CONSECUTIVE" && numberField("maxConsecutive", `Back-to-back classes for ${params.appliesTo === "FACULTY" ? "each faculty member" : "each section"}`, 1, 12)}
            {kind === "LUNCH_BREAK" && (
              <div className="grid gap-4 sm:grid-cols-2">
                {timeField("startMin", "Starts")}
                {timeField("endMin", "Ends")}
              </div>
            )}
            {kind === "SUBJECT_TIME_OF_DAY" && (
              <div className="grid gap-4 sm:grid-cols-2">
                {selectField("subjectId", "Subject", subjects, "Choose a subject")}
                {selectField("period", "Time of day", [
                  { value: "MORNING", label: "Morning (ends by 12:00 PM)" },
                  { value: "AFTERNOON", label: "Afternoon (from 12:00 PM)" },
                ])}
              </div>
            )}
            {kind === "MINIMUM_GAP" && numberField("minutes", `Minutes between classes for ${params.appliesTo === "FACULTY" ? "each faculty member" : "each section"}`, 5, 240, 5)}
            {kind === "ROOM_PRIORITY" && (
              <div className="grid gap-4 sm:grid-cols-2">
                {selectField("roomId", "Room", rooms, rooms.length ? "Choose a room" : "No department rooms", (id) => priorityName({ ...params, roomId: id }))}
                {selectField("facultyId", "Priority faculty member", faculty, "Choose a faculty member", (id) => priorityName({ ...params, facultyId: id }))}
              </div>
            )}
            {(kind === "ROOM_CAPACITY" || kind === "ROOM_DESIGNATION") && <p className="text-sm text-muted-foreground">No settings</p>}
            {isClassPolicy(kind) && <ClassPolicyFields key={kind} kind={kind} params={params} set={set} subjects={subjects} options={policyOptions} />}
          </div>

          <div className={cn("grid gap-4", isAdmin && "sm:grid-cols-2")}>
            <Field>
              <FieldLabel htmlFor="c-name">Name</FieldLabel>
              <Input id="c-name" value={name} onChange={(e) => { setName(e.target.value); setPreview(null); }} />
            </Field>
            {isAdmin && (
              <Field>
                <FieldLabel htmlFor="c-department">Applies to</FieldLabel>
                <NativeSelect id="c-department" value={departmentId} onChange={(e) => { setDepartmentId(e.target.value); setPreview(null); }} options={departments} placeholder="Every department" />
              </Field>
            )}
          </div>
          {preview && <div role="status" className="rounded-lg border bg-muted/40 p-3 text-sm">{preview.matching} matching · {preview.affected} need review · {preview.published} published</div>}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter className="m-0 rounded-b-xl border-t bg-muted/30 px-5 py-3">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          {isClassPolicy(kind) && <Button variant="outline" disabled={pending} onClick={() => {
            setError(""); startTransition(async () => {
              const result = await previewConstraintAction(existing?.id || null, { kind, name, params, departmentId: departmentId || null, enabled: existing?.enabled ?? true });
              if (result.ok) setPreview(result); else { setPreview(null); setError(result.error); }
            });
          }}>Preview impact</Button>}
          <Button onClick={save} disabled={pending || isClassPolicy(kind) && !preview}>{pending ? "Saving..." : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
