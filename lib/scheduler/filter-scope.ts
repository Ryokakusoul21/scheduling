import { ACADEMIC_LEVELS } from "@/lib/academics/levels";

/** The already-scoped data a person may browse; everything else is outside their view. */
export interface ScopeData {
  departments: { id: string }[];
  programs: { id: string; level: string; departmentId: string | null }[];
  sections: { id: string; level: string }[];
  terms: { id: string; level: string }[];
  faculty: { id: string }[];
  rooms: { id: string }[];
}

export interface FilterValues {
  level: string;
  departmentId: string;
  programId: string;
  yearLevel: string;
  gradeLevel: string;
  termId: string;
  sectionId: string;
  facultyId: string;
  roomId: string;
}

export const ALL_ACTIVE_TERMS = "active";

/** Levels that have at least one scoped program or section, in the usual order. */
export function scopedLevels(data: Pick<ScopeData, "programs" | "sections">): string[] {
  const present = new Set([...data.programs.map((p) => p.level), ...data.sections.map((s) => s.level)]);
  return ACADEMIC_LEVELS.filter((l) => present.has(l));
}

/** Selectors with a single possible value are hidden and pre-selected. */
export function fixedFilters(data: ScopeData): Partial<FilterValues> {
  const levels = scopedLevels(data);
  const fixed: Partial<FilterValues> = {};
  if (levels.length === 1) fixed.level = levels[0];
  const programs = data.programs.filter((p) => !fixed.level || p.level === fixed.level);
  if (fixed.level && programs.length === 1) fixed.programId = programs[0].id;
  if (data.departments.length === 1 && fixed.level === "COLLEGE") fixed.departmentId = data.departments[0].id;
  return fixed;
}

/**
 * Drops address parameters that point outside the scope and falls back to the default scoped view,
 * then applies the pre-selected values.
 */
export function sanitizeFilters<F extends FilterValues>(filters: F, data: ScopeData, defaults: Partial<FilterValues> = {}): F {
  const levels = scopedLevels(data);
  const fallback = (key: keyof FilterValues) => defaults[key] ?? (key === "termId" ? ALL_ACTIVE_TERMS : "");
  const checks: Record<keyof FilterValues, (v: string) => boolean> = {
    level: (v) => levels.includes(v),
    departmentId: (v) => data.departments.some((d) => d.id === v),
    programId: (v) => data.programs.some((p) => p.id === v && (!filters.level || p.level === filters.level)),
    yearLevel: () => true,
    gradeLevel: () => true,
    termId: (v) => v === ALL_ACTIVE_TERMS || data.terms.some((t) => t.id === v),
    sectionId: (v) => data.sections.some((s) => s.id === v),
    facultyId: (v) => data.faculty.some((f) => f.id === v),
    roomId: (v) => data.rooms.some((r) => r.id === v),
  };
  const next = { ...filters };
  for (const key of Object.keys(checks) as (keyof FilterValues)[]) {
    if (next[key] && !checks[key](next[key])) next[key] = fallback(key) as F[keyof FilterValues];
  }
  return { ...next, ...fixedFilters(data) };
}
