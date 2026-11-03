/**
 * Scheduler summary checks shared by the side panel, section cards, and submission.
 * Pure and browser-safe.
 */
import { remainingNeeds, subjectAppliesToSection, type SubjectNeed } from "./timetable";
import type { DetectedConflict, SchedEntry } from "./types";

type Section = { id: string; level: string; programId: string | null; yearLevel: string | null; gradeLevel: string | null; curriculum?: { subjectId: string; component: "LECTURE" | "LABORATORY" }[] };
type Subject = { id: string; level: string; programId: string | null; yearLevel: string | null; gradeLevel: string | null; lectureHours: number; labHours: number; archived?: boolean };
type Entry = SchedEntry & { status?: string };

/** Unscheduled subject components of one section in one term. */
export function sectionNeeds(section: Section, subjects: Subject[], entries: Entry[], termId: string): SubjectNeed[] {
  const applicable = subjects.filter((s) => !s.archived && subjectAppliesToSection(s, section));
  const inTerm = entries.filter((e) => e.sectionId === section.id && e.semesterId === termId && e.status !== "ARCHIVED");
  return remainingNeeds(section, applicable, inTerm, section.curriculum);
}

/** Unscheduled needs of every listed section, flattened in section order. */
export function allSectionNeeds(sections: Section[], subjects: Subject[], entries: Entry[], termOf: (sectionId: string) => string): SubjectNeed[] {
  return sections.flatMap((s) => sectionNeeds(s, subjects, entries, termOf(s.id)));
}

/** Classes whose faculty is empty, unknown, or no longer active, reported as warnings. */
export function facultyNotAssigned(entries: Entry[], activeFacultyIds: Set<string>): DetectedConflict[] {
  return entries
    .filter((e) => e.status !== "ARCHIVED" && (!e.facultyId || !activeFacultyIds.has(e.facultyId)))
    .map((e) => ({
      type: "FACULTY_NOT_ASSIGNED" as const,
      severity: "HIGH" as const,
      description: e.facultyId ? "The assigned faculty member is no longer active; assign another." : "No faculty member is assigned to this class.",
      entryA: e,
    }));
}

/** Sections whose plotted hours for a subject component differ from the subject's required hours. */
export function durationMismatches(entries: Entry[], subjects: Map<string, { code: string; lectureHours: number; labHours: number }>): DetectedConflict[] {
  const groups = new Map<string, Entry[]>();
  for (const e of entries) {
    if (e.status === "ARCHIVED" || !e.subjectId) continue;
    const key = `${e.semesterId}|${e.sectionId}|${e.subjectId}|${e.component}`;
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }
  const out: DetectedConflict[] = [];
  for (const list of groups.values()) {
    const first = list[0];
    const subject = subjects.get(first.subjectId);
    if (!subject) continue;
    const required = Math.round((first.component === "LECTURE" ? subject.lectureHours : subject.labHours) * 60);
    const plotted = list.reduce((sum, e) => sum + e.endMin - e.startMin, 0);
    if (plotted === required) continue;
    const kind = first.component === "LECTURE" ? "lecture" : "laboratory";
    out.push({
      type: "DURATION_MISMATCH",
      severity: "MEDIUM",
      description: `${subject.code} ${kind} has ${Math.round((plotted / 60) * 10) / 10} of ${Math.round((required / 60) * 10) / 10} required hours for this section.`,
      entryA: first,
    });
  }
  return out;
}
