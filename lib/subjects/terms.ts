import { termLabel } from "@/lib/academics/levels";

export type SubjectTerm = { id: string; name: string; type: string; programId: string | null; isActive: boolean };
export type SubjectCalendar = { id: string; name: string; isActive: boolean; semesters: SubjectTerm[] };
export type SubjectSemester = "ALL" | "FIRST" | "SECOND" | "SUMMER";

export function selectedSubjectSemester(options: { value: string }[], requested?: string): SubjectSemester {
  const value = ({ "1": "FIRST", "2": "SECOND", MIDYEAR: "SUMMER" } as Record<string, string>)[requested ?? ""] ?? requested;
  return options.some((o) => o.value === value) ? value as SubjectSemester : "ALL";
}

export function filterSubjectSemester<T extends { level: string; semester: string | null }>(rows: T[], semester: SubjectSemester) {
  return rows.filter((s) => s.level !== "COLLEGE" || semester === "ALL" || !s.semester || s.semester === semester);
}

/** A course's own calendar replaces the shared calendar for that academic year. */
export function subjectTerms(calendar: SubjectCalendar | null, programId: string | null) {
  const terms = calendar?.semesters ?? [];
  const own = programId ? terms.filter((t) => t.programId === programId) : [];
  return (own.length ? own : terms.filter((t) => !t.programId))
    .filter((t) => ["FIRST", "SECOND", "SUMMER"].includes(t.type))
    .sort((a, b) => ["FIRST", "SECOND", "SUMMER"].indexOf(a.type) - ["FIRST", "SECOND", "SUMMER"].indexOf(b.type));
}

export function subjectSemesterOptions(calendar: SubjectCalendar | null, programId: string | null) {
  return subjectTerms(calendar, programId).map((t) => ({ value: t.type, label: t.name || termLabel(t.type) }));
}

export function subjectSemesterError(calendar: SubjectCalendar | null, programId: string | null, semester: string | null) {
  const terms = subjectTerms(calendar, programId);
  if (!terms.length) return "Set up this course's semesters in Academic Years and Terms before saving college subjects.";
  if (semester && !terms.some((t) => t.type === semester)) return "Choose a semester configured for this course and academic year in Academic Years and Terms.";
  return null;
}
