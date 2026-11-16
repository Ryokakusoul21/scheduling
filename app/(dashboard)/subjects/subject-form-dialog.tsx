"use client";

import { useState, type ComponentProps } from "react";
import { FormDialog } from "@/components/ux/form-dialog";
import { termLabel } from "@/lib/academics/levels";
import { subjectSemesterOptions, subjectTerms, type SubjectCalendar } from "@/lib/subjects/terms";

/** Both subject editors use the registrar's calendar, including course overrides. */
export function SubjectFormDialog({ calendar, editing, ...props }: ComponentProps<typeof FormDialog> & { calendar: SubjectCalendar | null; editing: boolean }) {
  const initial = props.values as Record<string, unknown>;
  const [programId, setProgramId] = useState(String(initial.programId ?? ""));
  if (initial.level !== "COLLEGE") return <FormDialog {...props} />;
  const terms = subjectTerms(calendar, programId || null);
  const initialTerms = subjectTerms(calendar, String(initial.programId ?? "") || null);
  const options = subjectSemesterOptions(calendar, programId || null);
  const preferred = initialTerms.find((t) => t.type === initial.semester);
  const semester = editing ? String(initial.semester ?? "") : preferred?.type ?? initialTerms.find((t) => t.isActive)?.type ?? initialTerms[0]?.type ?? "";
  const missing = semester && !options.some((o) => o.value === semester);
  return <FormDialog {...props} onFieldChange={(name, value) => { if (name === "programId") setProgramId(value); }}
    values={{ ...initial, semester, academicYearId: calendar?.id ?? "" }}
    fields={[...props.fields.map((field) => field.name === "semester" ? {
      ...field, options: [
        { value: "", label: "Any configured semester" },
        ...(missing ? [{ value: semester, label: `${termLabel(semester)} (not configured)`, disabled: true }] : []),
        ...options,
      ],
      help: terms.length ? `From Academic Years and Terms · ${calendar?.name}.` : "No semesters configured. Set them up in Academic Years and Terms first.",
    } : field), { name: "academicYearId", label: "", type: "hidden" }]} />;
}
