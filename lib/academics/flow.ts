/**
 * URL state for the card-based selection flows used by Subjects and Sections:
 *   Level → (College: Program → Year) | (Basic Ed: Grade [→ SHS strand filter])
 */
import { LEVELS, isAcademicLevel, isGradeLevel, isYearLevel, type AcademicLevel, type GradeLevel, type YearLevel } from "./levels";

/** College subjects not tied to a course (General Education). */
export const GENERAL = "general";
/** Subjects offered in every year level. */
export const ANY_YEAR = "any";

export interface Flow {
  level: AcademicLevel | null;
  programId: string | null; // a program id, GENERAL, or null (not chosen)
  year: YearLevel | typeof ANY_YEAR | null;
  grade: GradeLevel | null;
  strand: string | null; // SHS strand filter within a grade
}

export function parseFlow(sp: Record<string, string | undefined>): Flow {
  const level = isAcademicLevel(sp.level) ? sp.level : null;
  const grade = isGradeLevel(sp.grade) && level && LEVELS[level].grades.includes(sp.grade) ? sp.grade : null;
  return {
    level,
    programId: level === "COLLEGE" && sp.program ? sp.program : null,
    year: level === "COLLEGE" && (isYearLevel(sp.year) || sp.year === ANY_YEAR) ? (sp.year as Flow["year"]) : null,
    grade,
    strand: level === "SENIOR_HIGH" && sp.strand ? sp.strand : null,
  };
}

/** True once enough has been chosen to show the list. */
export function isComplete(f: Flow) {
  if (!f.level) return false;
  if (f.level === "COLLEGE") return !!f.programId && !!f.year;
  return !!f.grade;
}

export function flowHref(base: string, f: Partial<Flow>) {
  const p = new URLSearchParams();
  if (f.level) p.set("level", f.level);
  if (f.programId) p.set("program", f.programId);
  if (f.year) p.set("year", f.year);
  if (f.grade) p.set("grade", f.grade);
  if (f.strand) p.set("strand", f.strand);
  const q = p.toString();
  return q ? `${base}?${q}` : base;
}
