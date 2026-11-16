"use client";

import { useState } from "react";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ux/native-select";
import { YEAR_LEVELS, gradeLabel, levelLabel, yearLabel } from "@/lib/academics/levels";
import { policyTargetSchema, type PolicyTarget } from "@/lib/scheduler/class-policies";
import { scopedPolicyOptions, type PolicyOption, type PolicyOptions } from "@/lib/scheduler/policy-options";
import { cn } from "@/lib/utils";
import { hoursLabel } from "@/lib/scheduler/class-policies";
import type { Params } from "./categories";

export type { PolicyOptions } from "@/lib/scheduler/policy-options";
export type PolicyTargetType = "ALL" | "PROGRAM_YEAR" | "SECTION" | "CATEGORY" | "SUBJECT" | "CLASS" | "MEETING";
export const TARGET_CHOICES: { value: PolicyTargetType; label: string; description: string }[] = [
  { value: "ALL", label: "All department classes", description: "Every class in this department and period" },
  { value: "PROGRAM_YEAR", label: "Program, year or grade", description: "A program, college year, or school grade" },
  { value: "SECTION", label: "Selected sections", description: "One or more sections" },
  { value: "CATEGORY", label: "Minor or major subjects", description: "Filter classes by subject type" },
  { value: "SUBJECT", label: "A specific subject", description: "One subject across matching sections" },
  { value: "CLASS", label: "A specific class", description: "One section and subject together" },
  { value: "MEETING", label: "One existing meeting", description: "A single saved class meeting" },
];
export function inferTargetType(t: PolicyTarget): PolicyTargetType {
  if (t.classId) return "MEETING";
  if (t.sectionId && t.subjectId) return "CLASS";
  if (t.sectionIds.length || t.sectionId) return "SECTION";
  if (t.subjectId) return "SUBJECT";
  if (t.subjectCategory) return "CATEGORY";
  if (t.programId || t.yearLevel || t.gradeLevel || t.level) return "PROGRAM_YEAR";
  return "ALL";
}

export function PolicySettingsFields({ kind, params, set }: { kind: string; params: Params; set: (key: string, value: unknown) => void }) {
  const [custom, setCustom] = useState("");
  if (kind === "CLASS_DURATION") {
    const selected = params.allowedMinutes as number[];
    const lengths = [...new Set([60, 90, 120, 180, ...selected])].sort((a, b) => a - b);
    return <div className="space-y-5">
      <fieldset><legend className="mb-2 font-medium">Allowed meeting lengths</legend>
        <div className="flex flex-wrap gap-2">{lengths.map((minutes) => <label key={minutes} className={cn("cursor-pointer rounded-lg border px-4 py-3 text-sm has-focus-visible:ring-2 has-focus-visible:ring-ring", selected.includes(minutes) && "border-primary bg-primary/5 text-primary")}>
          <input type="checkbox" className="sr-only" checked={selected.includes(minutes)} onChange={(e) => set("allowedMinutes", e.target.checked ? [...selected, minutes].sort((a, b) => a - b) : selected.filter((n) => n !== minutes))} />{hoursLabel(minutes)}
        </label>)}</div>
      </fieldset>
      <Field><FieldLabel htmlFor="policy-custom-duration">Custom length (hours)</FieldLabel><div className="flex max-w-sm gap-2"><Input id="policy-custom-duration" type="number" min={0.25} max={12} step={0.25} value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="For example, 2.5" /><button type="button" className="shrink-0 rounded-md border px-3 text-sm font-medium disabled:opacity-50" disabled={!custom || !Number.isInteger(Number(custom) * 60) || Number(custom) < 0.25 || Number(custom) > 12} onClick={() => { set("allowedMinutes", [...new Set([...selected, Math.round(Number(custom) * 60)])].sort((a, b) => a - b)); setCustom(""); }}>Add length</button></div>
        <FieldDescription>Weekly lecture and laboratory requirements continue to come from the curriculum.</FieldDescription>
      </Field>
      <details className="rounded-lg border p-3"><summary className="cursor-pointer text-sm font-medium">Advanced duration settings</summary><label className="mt-3 flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={!!params.allowFinalRemainder} onChange={(e) => set("allowFinalRemainder", e.target.checked)} /><span>Allow a shorter final meeting<span className="block text-xs text-muted-foreground">Only to complete the remaining required weekly hours.</span></span></label></details>
    </div>;
  }
  const modes = params.allowedModes as string[];
  const selection = modes.length === 2 ? "BOTH" : modes[0] ?? "IN_PERSON";
  return <div className="space-y-5">
    <fieldset><legend className="mb-3 font-medium">Delivery mode</legend><div className="grid gap-3 sm:grid-cols-3">
      {[
        { value: "IN_PERSON", label: "In person", detail: "An eligible physical room is required." },
        { value: "ONLINE_LIVE", label: "Live online", detail: "Teacher and section time are reserved; no room is needed." },
        { value: "BOTH", label: "Allow both", detail: "Choose in-person or live online delivery for each meeting." },
      ].map((choice) => <label key={choice.value} className={cn("cursor-pointer rounded-xl border p-4 has-focus-visible:ring-2 has-focus-visible:ring-ring", selection === choice.value && "border-primary bg-primary/5")}>
        <input className="sr-only" type="radio" name="policy-delivery" value={choice.value} checked={selection === choice.value} onChange={() => { set("allowedModes", choice.value === "BOTH" ? ["IN_PERSON", "ONLINE_LIVE"] : [choice.value]); if (choice.value !== "BOTH") set("defaultMode", choice.value); }} />
        <span className="block font-semibold">{choice.label}</span><span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{choice.detail}</span>
      </label>)}
    </div></fieldset>
    {selection === "BOTH" && <Field className="max-w-sm"><FieldLabel htmlFor="policy-default-mode">Default delivery mode</FieldLabel><NativeSelect id="policy-default-mode" value={String(params.defaultMode)} onChange={(e) => set("defaultMode", e.target.value)} options={[{ value: "IN_PERSON", label: "In person" }, { value: "ONLINE_LIVE", label: "Live online" }]} /><FieldDescription>This mode is suggested first when scheduling a matching class.</FieldDescription></Field>}
  </div>;
}

export function PolicyTargetFields({ params, set, options, departmentId, academicYearId, targetType, onTargetTypeChange }: {
  params: Params; set: (key: string, value: unknown) => void; options: PolicyOptions; departmentId: string; academicYearId: string;
  targetType: PolicyTargetType; onTargetTypeChange: (value: PolicyTargetType) => void;
}) {
  const [query, setQuery] = useState("");
  const target = policyTargetSchema.parse(params.target ?? {});
  const scoped = scopedPolicyOptions(options, departmentId, target, academicYearId);
  const update = (key: keyof PolicyTarget, value: string) => {
    const next = { ...target, [key]: value };
    if (["level", "programId", "yearLevel", "gradeLevel"].includes(key)) { next.sectionId = ""; next.sectionIds = []; next.subjectId = ""; next.classId = ""; }
    if (key === "level") { next.programId = ""; next.yearLevel = ""; next.gradeLevel = ""; }
    if (key === "sectionId" || key === "subjectCategory") { next.subjectId = ""; next.classId = ""; }
    set("target", next);
  };
  const pick = (key: keyof PolicyTarget, label: string, values: PolicyOption[], placeholder: string) => <Field>
    <FieldLabel htmlFor={`policy-${key}`}>{label}</FieldLabel><NativeSelect id={`policy-${key}`} value={String(target[key])} onChange={(e) => update(key, e.target.value)} options={values} placeholder={placeholder} />
  </Field>;
  const yearFields = <>
    {scoped.levels.length > 1 && pick("level", "Academic level", scoped.levels.map((value) => ({ value, label: levelLabel(value) })), "All department levels")}
    {scoped.programs.length > 0 && pick("programId", scoped.levels.includes("SENIOR_HIGH") && !scoped.levels.includes("COLLEGE") ? "Strand" : "Program", scoped.programs, "All department programs")}
    {scoped.levels.includes("COLLEGE") && (!target.level || target.level === "COLLEGE") && pick("yearLevel", "College year", YEAR_LEVELS.map((value) => ({ value, label: yearLabel(value) })), "All years")}
    {scoped.grades.length > 0 && pick("gradeLevel", "Grade", scoped.grades.map((value) => ({ value, label: gradeLabel(value) })), "All department grades")}
  </>;
  const category = pick("subjectCategory", "Subject type", [{ value: "MINOR", label: "Minor / General Education subjects" }, { value: "MAJOR", label: "Major subjects" }], "Choose subject type");
  const sectionIds = [...new Set([...target.sectionIds, ...(target.sectionId ? [target.sectionId] : [])])];
  return <div className="space-y-5">
    <fieldset><legend className="mb-3 font-medium">Which classes should follow this rule?</legend><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {TARGET_CHOICES.filter((choice) => choice.value !== "CATEGORY" || scoped.levels.includes("COLLEGE") || !!target.subjectCategory).map((choice) => <label key={choice.value} className={cn("cursor-pointer rounded-lg border p-3 text-sm has-focus-visible:ring-2 has-focus-visible:ring-ring", targetType === choice.value && "border-primary bg-primary/5")}>
        <input type="radio" name="policy-target-type" className="sr-only" checked={targetType === choice.value} onChange={() => onTargetTypeChange(choice.value)} /><span className="block font-medium">{choice.value === "PROGRAM_YEAR" && scoped.levels.length === 1 ? scoped.levels[0] === "COLLEGE" ? "Program and year" : scoped.levels[0] === "SENIOR_HIGH" ? "Strand and grade" : "Grade level" : choice.label}</span><span className="mt-1 block text-xs text-muted-foreground">{choice.value === "PROGRAM_YEAR" && scoped.levels.length === 1 ? scoped.levels[0] === "COLLEGE" ? "A program or college year" : scoped.levels[0] === "SENIOR_HIGH" ? "A strand or senior high grade" : "Grades offered by this department" : choice.description}</span>
      </label>)}
    </div></fieldset>
    {targetType === "ALL" && <p className="rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">This rule covers all classes in the department and selected period. Optional refinements can limit it to lectures or laboratories.</p>}
    {targetType === "PROGRAM_YEAR" && <div className="grid gap-4 sm:grid-cols-2">{yearFields}</div>}
    {targetType === "CATEGORY" && <div className="max-w-md">{category}</div>}
    {targetType === "SECTION" && <fieldset className="space-y-2"><legend className="mb-2 text-sm font-medium">Select sections</legend><Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search department sections" aria-label="Search department sections" /><div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border p-2">{scoped.sections.filter((s) => s.label.toLowerCase().includes(query.trim().toLowerCase())).map((section) => <label key={section.value} className="flex items-center gap-2 rounded px-2 py-2 text-sm hover:bg-muted"><input type="checkbox" checked={sectionIds.includes(section.value)} onChange={(e) => set("target", { ...target, sectionId: "", sectionIds: e.target.checked ? [...sectionIds, section.value] : sectionIds.filter((id) => id !== section.value) })} />{section.label}</label>)}{!scoped.sections.length && <p className="p-2 text-sm text-muted-foreground">No sections are available for this department and period.</p>}</div><p className="text-xs text-muted-foreground">{sectionIds.length} selected</p></fieldset>}
    {(targetType === "SUBJECT" || targetType === "CLASS") && <div className="grid gap-4 sm:grid-cols-2">{targetType === "CLASS" && pick("sectionId", "Section", scoped.sections, "Choose a department section")}{pick("subjectId", "Specific subject", scoped.subjects, targetType === "CLASS" && !target.sectionId ? "Choose a section first" : "Choose a subject")}</div>}
    {targetType === "MEETING" && pick("classId", "Individual meeting", scoped.classes, "Choose an existing department meeting")}
    <details className="rounded-lg border p-3"><summary className="cursor-pointer text-sm font-medium">Refine target (optional)</summary><div className="mt-4 grid gap-4 sm:grid-cols-2">
      {targetType !== "PROGRAM_YEAR" && yearFields}
      {targetType !== "CATEGORY" && scoped.levels.includes("COLLEGE") && category}
      {pick("component", "Class component", [{ value: "LECTURE", label: "Lecture" }, { value: "LABORATORY", label: "Laboratory" }], "Lecture and laboratory")}
    </div></details>
  </div>;
}

export function ClassPolicyFields({ kind, params, set, options, departmentId = "", academicYearId = "" }: {
  kind: string; params: Params; set: (key: string, value: unknown) => void; subjects?: PolicyOption[]; options: PolicyOptions; departmentId?: string; academicYearId?: string;
}) {
  const [targetType, setTargetType] = useState(() => inferTargetType(policyTargetSchema.parse(params.target ?? {})));
  return <><PolicySettingsFields kind={kind} params={params} set={set} /><PolicyTargetFields params={params} set={set} options={options} departmentId={departmentId} academicYearId={academicYearId} targetType={targetType} onTargetTypeChange={setTargetType} /></>;
}
