import { ACADEMIC_LEVELS, LEVELS, levelForGrade, type AcademicLevel } from "@/lib/academics/levels";
import type { PolicyTarget } from "./class-policies";

export interface PolicyOption {
  value: string;
  label: string;
  departmentId?: string | null;
  departmentIds?: string[];
  level?: string;
  programId?: string | null;
  programIds?: string[];
  sectionIds?: string[];
  yearLevel?: string | null;
  gradeLevel?: string | null;
  termId?: string | null;
  academicYearId?: string | null;
  sectionId?: string;
  subjectId?: string;
  category?: string;
  component?: string;
  isActive?: boolean;
}
export interface PolicyDepartment extends PolicyOption { code: string; levels: AcademicLevel[] }
export interface PolicyOptions {
  terms: PolicyOption[];
  programs: PolicyOption[];
  sections: PolicyOption[];
  classes: PolicyOption[];
  subjects?: PolicyOption[];
  years?: PolicyOption[];
  departments?: PolicyDepartment[];
}

export function departmentLevels(code: string, name: string, observed: string[]): AcademicLevel[] {
  const school: Record<string, AcademicLevel[]> = { SHS: ["SENIOR_HIGH"], JHS: ["JUNIOR_HIGH"], ELEM: ["ELEMENTARY"], "PRE-ELEM": ["PRE_ELEMENTARY"], BED: ["SENIOR_HIGH", "JUNIOR_HIGH", "ELEMENTARY", "PRE_ELEMENTARY"], GENED: ["COLLEGE"] };
  if (school[code]) return school[code];
  if (/^college\b/i.test(name)) return ["COLLEGE"];
  return ACADEMIC_LEVELS.filter((level) => observed.includes(level));
}

export function scopedPolicyOptions(options: PolicyOptions, departmentId: string, target: Partial<PolicyTarget> = {}, academicYearId = "") {
  const effectiveLevel = target.level || (target.yearLevel ? "COLLEGE" : target.gradeLevel ? levelForGrade(target.gradeLevel) : "");
  const departments = options.departments ?? [];
  const levels = departmentId ? departments.find((d) => d.value === departmentId)?.levels ?? [] : [...new Set(departments.flatMap((d) => d.levels))];
  const belongs = (item: PolicyOption) => !departmentId || item.departmentIds?.includes(departmentId) || item.departmentId === departmentId;
  const inLevel = (item: PolicyOption) => !item.level || levels.includes(item.level as AcademicLevel);
  const inPeriod = (item: PolicyOption) => (!academicYearId || !item.academicYearId || item.academicYearId === academicYearId) && (!target.termId || !item.termId || item.termId === target.termId);
  const matches = (item: PolicyOption) => (!target.programId || item.programId === target.programId)
    && (!target.yearLevel || !item.yearLevel || item.yearLevel === target.yearLevel)
    && (!target.gradeLevel || !item.gradeLevel || item.gradeLevel === target.gradeLevel)
    && (!effectiveLevel || item.level === effectiveLevel);
  const terms = options.terms.filter((t) => belongs(t) && inLevel(t) && (!academicYearId || t.academicYearId === academicYearId) && (!effectiveLevel || t.level === effectiveLevel) && (!target.programId || !t.programId || t.programId === target.programId));
  const programs = options.programs.filter((p) => belongs(p) && inLevel(p) && (!effectiveLevel || p.level === effectiveLevel));
  const sections = options.sections.filter((s) => belongs(s) && inLevel(s) && inPeriod(s) && matches(s));
  const sectionIds = new Set(sections.map((s) => s.value));
  const subjects = (options.subjects ?? []).filter((s) => belongs(s) && inLevel(s) && (!effectiveLevel || s.level === effectiveLevel)
    && (!target.programId || (s.programIds ? s.programIds.includes(target.programId) : !s.programId || s.programId === target.programId))
    && (!target.sectionId || !s.sectionIds || s.sectionIds.includes(target.sectionId))
    && (!target.subjectCategory || s.category === target.subjectCategory));
  const classes = options.classes.filter((c) => belongs(c) && inLevel(c) && inPeriod(c) && matches(c) && (!c.sectionId || sectionIds.has(c.sectionId))
    && (!target.sectionIds?.length || !!c.sectionId && target.sectionIds.includes(c.sectionId)) && (!target.sectionId || c.sectionId === target.sectionId) && (!target.subjectId || c.subjectId === target.subjectId)
    && (!target.classId || c.value === target.classId) && (!target.subjectCategory || c.category === target.subjectCategory) && (!target.component || c.component === target.component));
  const yearIds = new Set(options.terms.filter((t) => belongs(t) && inLevel(t)).map((t) => t.academicYearId));
  return { levels, terms, programs, sections, subjects, classes, years: (options.years ?? []).filter((y) => yearIds.has(y.value)), grades: levels.filter((level) => !effectiveLevel || level === effectiveLevel).flatMap((level) => [...LEVELS[level].grades]) };
}

export function initialPolicyPeriod(options: PolicyOptions, departmentId: string, termId = "") {
  const scoped = scopedPolicyOptions(options, departmentId);
  const existing = scoped.terms.find((t) => t.value === termId);
  const activeYear = scoped.years.find((y) => y.isActive)?.value;
  const term = existing ?? scoped.terms.find((t) => t.isActive && (!activeYear || t.academicYearId === activeYear)) ?? scoped.terms.find((t) => t.academicYearId === activeYear) ?? scoped.terms[0];
  return { academicYearId: term?.academicYearId ?? activeYear ?? "", termId: term?.value ?? "" };
}
