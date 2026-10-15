"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ACADEMIC_LEVELS,
  LEVELS,
  YEAR_LEVELS,
  gradeLabel,
  isAcademicLevel,
  levelLabel,
  yearLabel,
  type AcademicLevel,
} from "@/lib/academics/levels";
import type { SchedulerData, SchedulerEntry, SectionOption } from "./types";

export const ACTIVE_TERMS = "active";

export interface Filters {
  level: AcademicLevel | "";
  departmentId: string;
  programId: string;
  yearLevel: string;
  gradeLevel: string;
  termId: string; // a term id or ACTIVE_TERMS
  sectionId: string;
  facultyId: string;
  roomId: string;
}

const KEYS: (keyof Filters)[] = [
  "level",
  "departmentId",
  "programId",
  "yearLevel",
  "gradeLevel",
  "termId",
  "sectionId",
  "facultyId",
  "roomId",
];

/** Clearing a filter clears everything that depends on it. */
const DEPENDENTS: Partial<Record<keyof Filters, (keyof Filters)[]>> = {
  level: ["departmentId", "programId", "yearLevel", "gradeLevel", "termId", "sectionId"],
  departmentId: ["programId", "sectionId"],
  programId: ["sectionId"],
  yearLevel: ["sectionId"],
  gradeLevel: ["programId", "sectionId"],
};

/**
 * Cascading Scheduler filters: Academic Level → (College: Department → Program →
 * Year Level) | (Basic Ed: Grade Level → SHS Strand) → Term → Section.
 * State is mirrored to the URL (without a server round-trip) so views are
 * shareable and survive reloads.
 */
export function useSchedulerFilters(data: SchedulerData, defaults: Partial<Filters>) {
  const params = useSearchParams();
  const [filters, setFilters] = useState<Filters>(() => {
    const read = (k: keyof Filters) => params.get(k) ?? defaults[k] ?? "";
    const level = read("level");
    return {
      level: isAcademicLevel(level) ? level : "",
      departmentId: read("departmentId"),
      programId: read("programId"),
      yearLevel: read("yearLevel"),
      gradeLevel: read("gradeLevel"),
      termId: read("termId") || ACTIVE_TERMS,
      sectionId: read("sectionId"),
      facultyId: read("facultyId"),
      roomId: read("roomId"),
    };
  });

  const update = useCallback((patch: Partial<Filters>) => {
    setFilters((prev) => {
      // Reset filters that depend on a changed one (level is never a dependent).
      const reset: Partial<Record<keyof Filters, string>> = {};
      for (const key of Object.keys(patch) as (keyof Filters)[]) {
        if (patch[key] === prev[key]) continue;
        for (const dep of DEPENDENTS[key] ?? []) if (!(dep in patch)) reset[dep] = dep === "termId" ? ACTIVE_TERMS : "";
      }
      return { ...prev, ...reset, ...patch } as Filters;
    });
  }, []);

  // Mirror filters to the address after the change commits; updaters run during render and must stay pure.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const url = new URL(window.location.href);
    for (const k of KEYS) {
      const v = filters[k];
      if (v && !(k === "termId" && v === ACTIVE_TERMS)) url.searchParams.set(k, v);
      else url.searchParams.delete(k);
    }
    if (url.href !== window.location.href) window.history.replaceState(null, "", url);
  }, [filters]);

  const options = useMemo(() => {
    const { level, departmentId, programId, yearLevel, gradeLevel } = filters;
    const levelInfo = level ? LEVELS[level] : null;

    const programsForLevel = data.programs.filter((p) => !level || p.level === level);
    const departments =
      level === "COLLEGE"
        ? data.departments.filter((d) => programsForLevel.some((p) => p.departmentId === d.id))
        : [];
    const programs = programsForLevel.filter((p) => !departmentId || p.departmentId === departmentId);

    const terms = data.terms.filter(
      (t) => (!level || t.level === level) && (!programId || !t.programId || t.programId === programId)
    );

    const deptProgramIds = departmentId ? new Set(programs.map((p) => p.id)) : null;
    const sections = data.sections.filter(
      (s) => sectionMatches(s, filters) && (!deptProgramIds || (!!s.programId && deptProgramIds.has(s.programId)))
    );

    return {
      levels: ACADEMIC_LEVELS.map((l) => ({ value: l, label: levelLabel(l) })),
      departments: departments.map((d) => ({ value: d.id, label: d.name })),
      programs: programs.map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` })),
      programLabel: level === "SENIOR_HIGH" ? "Strand" : "Program",
      showDepartment: level === "COLLEGE",
      showProgram: level === "COLLEGE" || level === "SENIOR_HIGH",
      showYear: level === "COLLEGE",
      showGrade: !!levelInfo && levelInfo.grades.length > 0,
      years: YEAR_LEVELS.slice(0, 4).map((y) => ({ value: y, label: yearLabel(y) })),
      grades: (levelInfo?.grades ?? []).map((g) => ({ value: g, label: gradeLabel(g) })),
      terms: [
        { value: ACTIVE_TERMS, label: "All active terms" },
        ...terms.map((t) => ({ value: t.id, label: t.label })),
      ],
      sections,
      sectionOptions: sections.map((s) => ({ value: s.id, label: s.name })),
      faculty: data.faculty.map((f) => ({ value: f.id, label: f.fullName })),
      rooms: data.rooms.map((r) => ({ value: r.id, label: `${r.roomName} · ${r.location}` })),
      yearLevel,
      gradeLevel,
    };
  }, [data, filters]);

  const activeTermIds = useMemo(() => new Set(data.terms.filter((t) => t.isActive).map((t) => t.id)), [data.terms]);

  /** Entries that match every filter except the specific section (used for conflicts & section cards). */
  const scopeEntries = useMemo(() => {
    const sectionIds = new Set(options.sections.map((s) => s.id));
    return data.entries.filter(
      (e) =>
        (filters.termId === ACTIVE_TERMS ? activeTermIds.has(e.semesterId) : e.semesterId === filters.termId) &&
        sectionIds.has(e.sectionId) &&
        (!filters.facultyId || e.facultyId === filters.facultyId) &&
        (!filters.roomId || e.roomId === filters.roomId)
    );
    // data.entries is replaced wholesale by the workspace, so it is a safe dependency.
  }, [data.entries, options.sections, filters, activeTermIds]);

  const visibleEntries = useMemo(
    () => (filters.sectionId ? scopeEntries.filter((e) => e.sectionId === filters.sectionId) : scopeEntries),
    [scopeEntries, filters.sectionId]
  );

  /** Focused timetable subject: a single section, faculty member, or room. */
  const focus = filters.sectionId
    ? ({ kind: "section", id: filters.sectionId } as const)
    : filters.facultyId
      ? ({ kind: "faculty", id: filters.facultyId } as const)
      : filters.roomId
        ? ({ kind: "room", id: filters.roomId } as const)
        : null;

  /** Sets every filter needed to show this entry's section timetable (used by "jump to conflict"). */
  const revealEntry = useCallback(
    (entry: SchedulerEntry) => {
      const section = data.sections.find((s) => s.id === entry.sectionId);
      if (!section) return;
      const program = data.programs.find((p) => p.id === section.programId);
      update({
        level: section.level as AcademicLevel,
        departmentId: section.level === "COLLEGE" ? (program?.departmentId ?? "") : "",
        programId: section.programId ?? "",
        yearLevel: section.yearLevel ?? "",
        gradeLevel: section.gradeLevel ?? "",
        termId: activeTermIds.has(entry.semesterId) && filters.termId === ACTIVE_TERMS ? ACTIVE_TERMS : entry.semesterId,
        sectionId: section.id,
        facultyId: "",
        roomId: "",
      });
    },
    [data.sections, data.programs, update, activeTermIds, filters.termId]
  );

  return { filters, update, options, scopeEntries, visibleEntries, focus, revealEntry, activeTermIds };
}

export function sectionMatches(s: SectionOption, f: Filters) {
  if (f.level && s.level !== f.level) return false;
  if (f.programId && s.programId !== f.programId) return false;
  if (f.yearLevel && s.yearLevel !== f.yearLevel) return false;
  if (f.gradeLevel && s.gradeLevel !== f.gradeLevel) return false;
  return true;
}
