"use client";

import { hoursLabel } from "@/lib/scheduler/class-policies";

import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ux/native-select";
import { EMPTY_POLICY_TARGET, policyTargetSchema } from "@/lib/scheduler/class-policies";
import { PARAM_SCHEMAS } from "@/lib/scheduler/constraints";
import { initialPolicyPeriod, scopedPolicyOptions, type PolicyOptions } from "@/lib/scheduler/policy-options";
import { gradeLabel, levelLabel, yearLabel } from "@/lib/academics/levels";
import { cn } from "@/lib/utils";
import { DEFAULT_PARAMS, settingChips, type ConstraintRow, type Params } from "./categories";
import { inferTargetType, PolicySettingsFields, PolicyTargetFields, type PolicyTargetType } from "./class-policy-fields";
import { previewConstraintAction, saveConstraintAction } from "./actions";

type Kind = "CLASS_DURATION" | "DELIVERY_MODE";
type Preview = Extract<Awaited<ReturnType<typeof previewConstraintAction>>, { ok: true }>;
const STEPS = ["Rule", "Target", "Review"];

export function PolicyWizard({ row, initialKind, initialParams, initialName, options, isAdmin, onClose, onOtherRules }: {
  row: ConstraintRow | null; initialKind: Kind; initialParams: Params; initialName: string; options: PolicyOptions; isAdmin: boolean;
  onClose: () => void; onOtherRules: () => void;
}) {
  const departments = options.departments ?? [];
  const schoolWide = isAdmin && !!row && row.departmentId === null;
  const initialDepartment = row?.departmentId ?? (schoolWide ? "" : departments[0]?.value ?? "");
  const originalTarget = policyTargetSchema.parse(initialParams.target ?? {});
  const initialPeriod = initialPolicyPeriod(options, initialDepartment, originalTarget.termId);
  const [kind, setKind] = useState<Kind>(initialKind);
  const [step, setStep] = useState(0);
  const [departmentId, setDepartmentId] = useState(initialDepartment);
  const [yearId, setYearId] = useState(initialPeriod.academicYearId);
  const [allTerms, setAllTerms] = useState(!!row && !originalTarget.termId);
  const [params, setParams] = useState<Params>(() => ({ ...initialParams, target: { ...originalTarget, termId: row ? originalTarget.termId : initialPeriod.termId } }));
  const [targetType, setTargetType] = useState<PolicyTargetType>(() => inferTargetType(originalTarget));
  const [customName, setCustomName] = useState(row?.name ?? (initialName === "Class delivery mode" || initialName === "Class meeting duration" ? "" : initialName));
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, [step]);
  const target = policyTargetSchema.parse(params.target ?? {});
  const scoped = scopedPolicyOptions(options, departmentId, target, allTerms ? "" : yearId);
  const departmentName = departments.find((d) => d.value === departmentId)?.label ?? "School-wide";
  const names = new Map([...options.terms, ...options.programs, ...options.sections, ...options.classes, ...options.subjects ?? []].map((item) => [item.value, item.label]));
  const chips = settingChips(kind, params, names);
  const targetDescription = [target.subjectCategory && (target.subjectCategory === "MINOR" ? "minor subjects" : "major subjects"), target.programId && names.get(target.programId), target.yearLevel && yearLabel(target.yearLevel), target.gradeLevel && gradeLabel(target.gradeLevel), target.level && levelLabel(target.level), ...target.sectionIds.map((id) => names.get(id)), target.sectionId && names.get(target.sectionId), target.subjectId && names.get(target.subjectId), target.component && (target.component === "LECTURE" ? "lectures" : "laboratories"), target.classId && names.get(target.classId)].filter(Boolean).join(" / ") || "all department classes";
  const settingDescription = kind === "CLASS_DURATION" ? `Allow meetings of ${(params.allowedMinutes as number[]).map(hoursLabel).join(" or ")}` : (params.allowedModes as string[]).length === 2 ? "Allow in-person or live online delivery" : params.defaultMode === "ONLINE_LIVE" ? "Require live online delivery" : "Require in-person delivery";
  const summary = `${settingDescription} for ${targetDescription}.`;
  const autoName = `${kind === "DELIVERY_MODE" ? "Delivery" : "Duration"}: ${departments.find((d) => d.value === departmentId)?.code ?? "School"} - ${targetDescription}`.slice(0, 120);
  const name = customName.trim() || autoName;
  const input = { kind, name, params, departmentId: departmentId || null, enabled: row?.enabled ?? true };
  const noDepartment = !departmentId && !schoolWide;
  const set = (key: string, value: unknown) => { setParams((p) => ({ ...p, [key]: value })); setPreview(null); setError(""); };

  function changeContext(nextDepartment: string, nextYear?: string, nextTerm?: string, acrossTerms = allTerms) {
    const period = initialPolicyPeriod(options, nextDepartment);
    const nextYearId = nextYear ?? period.academicYearId;
    const terms = scopedPolicyOptions(options, nextDepartment, {}, nextYearId).terms;
    const termId = nextTerm ?? terms.find((t) => t.isActive)?.value ?? terms[0]?.value ?? "";
    setDepartmentId(nextDepartment); setYearId(nextYearId); setAllTerms(acrossTerms); setTargetType("ALL");
    setParams((p) => ({ ...p, target: { ...EMPTY_POLICY_TARGET, termId: acrossTerms ? "" : termId } }));
    setPreview(null); setError(""); if (step === 2) setStep(1);
  }

  function chooseTarget(value: PolicyTargetType) {
    setTargetType(value);
    set("target", { ...EMPTY_POLICY_TARGET, termId: target.termId });
  }

  function validate() {
    if (noDepartment) return "Choose a department you are authorized to manage.";
    if (!allTerms && !target.termId) return "Choose an academic term, or explicitly select All terms.";
    const parsed = PARAM_SCHEMAS[kind].safeParse(params);
    if (!parsed.success) return parsed.error.issues[0]?.message ?? "Check the rule settings.";
    if (name.length < 2) return "Enter a rule name.";
    return null;
  }

  function review() {
    const settingsError = validate();
    const targetError = targetType === "PROGRAM_YEAR" && !(target.programId || target.yearLevel || target.gradeLevel || target.level) ? "Choose a program, year, grade, or academic level."
      : targetType === "SECTION" && !target.sectionIds.length && !target.sectionId ? "Select at least one section."
      : targetType === "CATEGORY" && !target.subjectCategory ? "Choose minor or major subjects."
      : targetType === "SUBJECT" && !target.subjectId ? "Choose a subject."
      : targetType === "CLASS" && !(target.sectionId && target.subjectId) ? "Choose both a section and subject for this class."
      : targetType === "MEETING" && !target.classId ? "Choose an existing meeting." : null;
    if (settingsError || targetError) { setError(settingsError ?? targetError ?? ""); return; }
    setError(""); setPreview(null); setStep(2);
    startTransition(async () => {
      const result = await previewConstraintAction(row?.id || null, input);
      if (result.ok) setPreview(result); else setError(result.error);
    });
  }

  function next() {
    if (step === 0) { const problem = validate(); if (problem) setError(problem); else { setError(""); setStep(1); } return; }
    if (step === 1) { review(); return; }
    if (!preview) return;
    startTransition(async () => {
      const result = await saveConstraintAction(row?.id || null, { ...input, previewToken: preview.token });
      if (!result.ok) { setPreview(null); setError(result.error ?? "Could not save the rule. Review the impact again."); return; }
      toast.success(row?.id ? "Scheduling rule updated" : "Scheduling rule created"); onClose();
    });
  }

  return <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
    <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl">
      <form onSubmit={(event) => { event.preventDefault(); if (!pending) next(); }} className="flex min-h-0 flex-1 flex-col">
        <DialogHeader className="shrink-0 border-b px-5 py-4 sm:px-6">
          <DialogTitle>{row?.id ? "Edit scheduling rule" : "Create scheduling rule"}<span className="sr-only"> - Step {step + 1} of 3: {STEPS[step]}</span></DialogTitle>
          <DialogDescription>Set a rule for the classes your department covers.</DialogDescription>
          <ol className="mt-2 grid grid-cols-3 gap-2" aria-label="Rule creation progress">{STEPS.map((label, index) => <li key={label} aria-current={index === step ? "step" : undefined} className={cn("flex items-center gap-2 border-b-2 pb-2 text-sm", index <= step ? "border-primary font-medium text-foreground" : "border-border text-muted-foreground")}><span className={cn("flex size-6 items-center justify-center rounded-full text-xs", index <= step ? "bg-primary text-primary-foreground" : "bg-muted")}>{index + 1}</span>{label}</li>)}</ol>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
          <section aria-label="Department and academic period" className="space-y-3 rounded-xl border bg-muted/30 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1"><p className="text-xs font-medium text-muted-foreground">Department</p>
              {departments.length <= 1 && !schoolWide ? <p className="mt-1 font-semibold">{departments[0]?.label ?? "No department assigned"}</p> : <NativeSelect aria-label="Managed department" className="mt-1" disabled={pending} value={departmentId} onChange={(e) => changeContext(e.target.value)} options={[...(schoolWide ? [{ value: "", label: "School-wide" }] : []), ...departments]} />}
              <p className="mt-1 text-xs text-muted-foreground">{schoolWide && !departmentId ? "Editing an existing school-wide rule." : "This rule stays within the selected department."}</p>
            </div><span className="rounded-full border bg-background px-2.5 py-1 text-xs font-medium">Required rule</span></div>
            {!allTerms && <div className="grid gap-3 sm:grid-cols-2"><Field><FieldLabel htmlFor="wizard-year">Academic year</FieldLabel><NativeSelect id="wizard-year" disabled={pending} value={yearId} onChange={(e) => changeContext(departmentId, e.target.value)} options={scoped.years} /></Field><Field><FieldLabel htmlFor="wizard-term">Term</FieldLabel><NativeSelect id="wizard-term" disabled={pending} value={target.termId} onChange={(e) => changeContext(departmentId, yearId, e.target.value, false)} options={scoped.terms.map((t) => ({ ...t, label: scoped.levels.length > 1 && t.level ? `${levelLabel(t.level)} - ${t.label}` : t.label }))} placeholder="Choose a department term" /></Field></div>}
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={pending} checked={allTerms} onChange={(e) => changeContext(departmentId, yearId, undefined, e.target.checked)} />All terms <span className="text-xs text-muted-foreground">(including other academic years)</span></label>
          </section>

          <h2 ref={heading} tabIndex={-1} className="text-base font-semibold outline-none">{step === 0 ? "What should this rule control?" : step === 1 ? "Choose the classes covered" : "Review before saving"}</h2>
          {step === 0 && <div className="space-y-5">
            <fieldset><legend className="sr-only">Rule type</legend><div className="grid gap-3 sm:grid-cols-2">{[{ value: "DELIVERY_MODE" as const, label: "Delivery mode", description: "In person, live online, or allow both" }, { value: "CLASS_DURATION" as const, label: "Meeting duration", description: "Allowed lengths and the final remaining minutes" }].map((choice) => <label key={choice.value} className={cn("cursor-pointer rounded-xl border p-4 has-focus-visible:ring-2 has-focus-visible:ring-ring", kind === choice.value && "border-primary bg-primary/5")}><input className="sr-only" type="radio" name="wizard-kind" checked={kind === choice.value} onChange={() => { setKind(choice.value); setParams({ ...DEFAULT_PARAMS[choice.value], target }); setPreview(null); setError(""); }} /><span className="block font-semibold">{choice.label}</span><span className="mt-1 block text-xs text-muted-foreground">{choice.description}</span></label>)}</div></fieldset>
            <PolicySettingsFields key={kind} kind={kind} params={params} set={set} />
            <details className="rounded-lg border p-3"><summary className="cursor-pointer text-sm font-medium">Rule name (optional)</summary><Input aria-label="Rule name" className="mt-3" value={customName} onChange={(e) => { setCustomName(e.target.value); setPreview(null); }} placeholder={autoName} maxLength={120} /><p className="mt-2 text-xs text-muted-foreground">A name is generated from the rule and its target.</p></details>
            {!row && <button type="button" className="text-sm text-muted-foreground underline underline-offset-4" onClick={onOtherRules}>Other schedule rules: breaks, gaps, and preferred times</button>}
          </div>}
          {step === 1 && <PolicyTargetFields params={params} set={set} options={options} departmentId={departmentId} academicYearId={allTerms ? "" : yearId} targetType={targetType} onTargetTypeChange={chooseTarget} />}
          {step === 2 && <PolicyReview summary={summary} name={name} departmentName={departmentName} period={allTerms ? "All terms and academic years" : `${scoped.years.find((y) => y.value === yearId)?.label ?? ""} - ${scoped.terms.find((t) => t.value === target.termId)?.label ?? ""}`} chips={chips} preview={preview} pending={pending} matchingMeetings={scoped.classes} />}
          {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter className="shrink-0 flex-row items-center justify-between border-t bg-muted/20 px-5 py-4 sm:justify-between sm:px-6"><Button type="button" variant="ghost" className="min-h-11 px-4" disabled={pending} onClick={step === 0 ? onClose : () => { setStep(step - 1); setError(""); }}>{step === 0 ? "Cancel" : "Back"}</Button><div className="flex gap-2">{step === 2 && !preview && !pending && <Button type="button" variant="outline" className="min-h-11 px-4" onClick={review}>Check impact again</Button>}<Button type="submit" className="min-h-11 px-4" disabled={pending || noDepartment || step === 2 && !preview}>{pending ? "Checking..." : step === 2 ? row?.id ? "Save changes" : "Create rule" : "Continue"}</Button></div></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}

export function PolicyReview({ name, departmentName, period, chips, preview, pending, matchingMeetings, summary }: { name: string; departmentName: string; period: string; chips: string[]; preview: Preview | null; pending: boolean; matchingMeetings: { value: string; label: string }[]; summary?: string }) {
  return <div className="space-y-4"><div className="rounded-xl border p-4"><p className="font-semibold">{name}</p>{summary && <p className="mt-2 text-sm leading-relaxed">{summary}</p>}<p className="mt-1 text-sm text-muted-foreground">{departmentName} - {period}</p><ul className="mt-3 flex flex-wrap gap-2">{chips.map((chip) => <li key={chip} className="rounded-md bg-muted px-2 py-1 text-xs">{chip}</li>)}</ul></div>
    <div role="status" aria-live="polite" className="rounded-xl border bg-muted/30 p-4">{preview ? <><div className="grid grid-cols-3 gap-3">{[[preview.matching, "Matching meetings"], [preview.affected, "Need review"], [preview.published, "Published and affected"]].map(([count, label]) => <div key={label}><p className="text-2xl font-semibold tabular-nums">{count}</p><p className="text-xs text-muted-foreground">{label}</p></div>)}</div><p className="mt-3 text-xs text-muted-foreground">Existing times and delivery modes stay unchanged. Affected classes must be reviewed before submission or publication.</p></> : <p className="text-sm">{pending ? "Checking visible classes and published meetings..." : "Review the impact before creating this rule."}</p>}</div>
    {matchingMeetings.length > 0 && <details className="rounded-lg border p-3"><summary className="cursor-pointer text-sm font-medium">Matching meetings in this department ({matchingMeetings.length})</summary><ul className="mt-2 space-y-2 text-sm text-muted-foreground">{matchingMeetings.slice(0, 8).map((meeting) => <li key={meeting.value}>{meeting.label}</li>)}</ul>{matchingMeetings.length > 8 && <p className="mt-2 text-xs text-muted-foreground">And {matchingMeetings.length - 8} more matching meetings.</p>}</details>}
  </div>;
}
