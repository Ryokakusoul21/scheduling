/** Finds the issues the resolver works on and counts them, using the existing detectors only. Browser-safe. */
import { durationMismatches } from "../summary";
import { validateSchedule, type ValidationWorld } from "../validate";
import type { Issue, IssueCounts, ResolverEntry, ResolverInput, ResolverSection } from "./types";

/** Over the requirement in this many sections, or by this factor, means the subject setup is suspect. */
const DATA_PROBLEM_SECTIONS = 3;
const DATA_PROBLEM_FACTOR = 2;

export function worldOf(input: ResolverInput): ValidationWorld {
  return {
    conflicts: {
      facultyById: new Map(input.faculty.map((f) => [f.id, f])),
      roomById: new Map(input.rooms.map((r) => [r.id, r])),
      subjectById: new Map(input.subjects.map((s) => [s.id, { ...s }])),
      sectionStudentCountById: new Map(input.sections.map((s) => [s.id, s.studentCount])),
      termRanges: input.termRanges,
    },
    rules: input.rules,
    ruleCtx: input.ruleCtx,
    bounds: input.bounds,
  };
}

export const live = (entries: ResolverEntry[]) => entries.filter((e) => e.status !== "ARCHIVED");

/** Minutes on the timetable for one section, subject, and component. */
export function plotted(entries: ResolverEntry[], sectionId: string, subjectId: string, component: string) {
  return entries.filter((e) => e.sectionId === sectionId && e.subjectId === subjectId && e.component === component && e.status !== "ARCHIVED").reduce((s, e) => s + e.endMin - e.startMin, 0);
}

/** Curriculum components of a section with their required and plotted minutes. */
export function progress(section: ResolverSection, entries: ResolverEntry[]) {
  return section.curriculum.map((n) => ({ ...n, scheduledMin: plotted(entries, section.id, n.subjectId, n.component) }));
}

const subjectKey = (subjectId: string, component: string) => `${subjectId}|${component}`;

/** Issues in the given sections, in a stable order. */
export function detectIssues(input: ResolverInput, entries: ResolverEntry[], sectionIds: Set<string>, world = worldOf(input)): Issue[] {
  const current = live(entries);
  const sections = input.sections.filter((s) => sectionIds.has(s.id));
  const subjects = new Map(input.subjects.map((s) => [s.id, s]));
  const issues: Issue[] = [];

  // Missing or partial hours, from the curriculum queue.
  for (const s of sections) {
    for (const n of progress(s, current)) {
      if (n.scheduledMin >= n.requiredMin) continue;
      const code = subjects.get(n.subjectId)?.code ?? "Subject";
      const kind = n.component === "LECTURE" ? "lecture" : "laboratory";
      issues.push({
        id: `${n.scheduledMin === 0 ? "unscheduled" : "hours"}:${s.id}:${n.subjectId}:${n.component}`,
        kind: n.scheduledMin === 0 ? "UNSCHEDULED" : "HOURS",
        sectionId: s.id,
        subjectId: n.subjectId,
        component: n.component,
        entryIds: current.filter((e) => e.sectionId === s.id && e.subjectId === n.subjectId && e.component === n.component).map((e) => e.id),
        description: n.scheduledMin === 0 ? `${code} ${kind} is not on the timetable.` : `${code} ${kind} has ${n.scheduledMin / 60} of ${n.requiredMin / 60} required hours.`,
      });
    }
  }

  // Over the requirement: trimmed, unless the same subject is over in many sections or by a wide margin.
  const scoped = current.filter((e) => sectionIds.has(e.sectionId) && !e.busy);
  const over = durationMismatches(scoped, subjects).filter((m) => {
    const required = (m.entryA.component === "LECTURE" ? subjects.get(m.entryA.subjectId)!.lectureHours : subjects.get(m.entryA.subjectId)!.labHours) * 60;
    return plotted(current, m.entryA.sectionId, m.entryA.subjectId, m.entryA.component) > required;
  });
  const overBySubject = new Map<string, number>();
  for (const m of over) overBySubject.set(subjectKey(m.entryA.subjectId, m.entryA.component), (overBySubject.get(subjectKey(m.entryA.subjectId, m.entryA.component)) ?? 0) + 1);
  for (const m of over) {
    const e = m.entryA;
    const subject = subjects.get(e.subjectId)!;
    const required = (e.component === "LECTURE" ? subject.lectureHours : subject.labHours) * 60;
    const actual = plotted(current, e.sectionId, e.subjectId, e.component);
    issues.push({
      id: `hours:${e.sectionId}:${e.subjectId}:${e.component}`,
      kind: "HOURS",
      sectionId: e.sectionId,
      subjectId: e.subjectId,
      component: e.component,
      entryIds: current.filter((x) => x.sectionId === e.sectionId && x.subjectId === e.subjectId && x.component === e.component).map((x) => x.id),
      description: m.description,
      dataProblem: (overBySubject.get(subjectKey(e.subjectId, e.component)) ?? 0) >= DATA_PROBLEM_SECTIONS || actual >= required * DATA_PROBLEM_FACTOR,
    });
  }

  // Room type mismatches and double bookings, straight from the detector.
  const ids = new Set(scoped.map((e) => e.id));
  const byId = new Map(current.map((e) => [e.id, e]));
  const seen = new Set<string>();
  for (const f of validateSchedule(current, world)) {
    const mine = f.entryIds.filter((id) => ids.has(id));
    if (!mine.length) continue;
    const kind = f.source === "SUBJECT_REQUIREMENT_CONFLICT" ? "ROOM_TYPE" : f.overlap ? "CONFLICT" : null;
    if (!kind) continue;
    const id = `${kind === "ROOM_TYPE" ? "room" : "conflict"}:${[...f.entryIds].sort().join("+")}:${f.source}`;
    if (seen.has(id)) continue;
    seen.add(id);
    issues.push({ id, kind, sectionId: byId.get(mine[0])!.sectionId, entryIds: f.entryIds, description: f.message });
  }

  return issues;
}

/** The resolver issue behind a Scheduler panel finding, or null when the resolver does not handle that type. */
export function issueFor(c: { type: string; entryA: { id?: string; sectionId: string; subjectId: string; component: string }; entryB?: { id?: string } }): { id: string; kind: Issue["kind"] } | null {
  const ids = [c.entryA.id, c.entryB?.id].filter(Boolean).sort().join("+");
  if (c.type === "SUBJECT_REQUIREMENT_CONFLICT") return { id: `room:${ids}:${c.type}`, kind: "ROOM_TYPE" };
  if (c.type === "FACULTY_CONFLICT" || c.type === "ROOM_CONFLICT" || c.type === "SECTION_CONFLICT") return { id: `conflict:${ids}:${c.type}`, kind: "CONFLICT" };
  if (c.type === "DURATION_MISMATCH") return { id: `hours:${c.entryA.sectionId}:${c.entryA.subjectId}:${c.entryA.component}`, kind: "HOURS" };
  return null;
}

/** Panel counts for the given sections: unscheduled components, warnings, and double bookings. */
export function countIssues(input: ResolverInput, entries: ResolverEntry[], sectionIds: Set<string>, world = worldOf(input)): IssueCounts {
  const current = live(entries);
  const unscheduled = input.sections.filter((s) => sectionIds.has(s.id)).flatMap((s) => progress(s, current)).filter((n) => n.scheduledMin < n.requiredMin).length;
  const ids = new Set(current.filter((e) => sectionIds.has(e.sectionId) && !e.busy).map((e) => e.id));
  const findings = validateSchedule(current, world).filter((f) => f.hard && f.entryIds.some((id) => ids.has(id)));
  const subjects = new Map(input.subjects.map((s) => [s.id, s]));
  const mismatches = durationMismatches(current.filter((e) => ids.has(e.id)), subjects).length;
  return {
    unscheduled,
    warnings: findings.filter((f) => !f.overlap).length + mismatches,
    conflicts: findings.filter((f) => f.overlap).length,
  };
}
