import { z } from "zod";
import { subjectLoad, type AssignableFaculty, type AssignableSubject } from "./assignment-rules";

/** One section's teacher after saving; a null faculty removes the current teacher. */
export type PlanChange = { sectionId: string | null; facultyId: string | null };

/** Shared by the assign modal and the server action so both validate the same way. */
export const planSchema = z.object({
  subjectIds: z.array(z.string().min(1)).min(1, "Choose at least one subject").max(100),
  semesterId: z.string().min(1, "Choose a term"),
  changes: z
    .array(z.object({ sectionId: z.string().nullable().transform((v) => v || null), facultyId: z.string().min(1).nullable() }))
    .min(1, "Choose at least one change")
    .max(200),
});
export type PlanInput = z.input<typeof planSchema>;

export type PlanSubject = AssignableSubject & { id: string; assignments: { facultyId: string; sectionId: string | null }[] };

/** Last change per section wins, so a later pick replaces an earlier one. */
export function applyChanges(assignments: { facultyId: string; sectionId: string | null }[], changes: PlanChange[]) {
  const next = new Map<string, string>(assignments.map((a) => [a.sectionId ?? "", a.facultyId]));
  for (const c of changes) {
    if (c.facultyId) next.set(c.sectionId ?? "", c.facultyId);
    else next.delete(c.sectionId ?? "");
  }
  return next;
}

/**
 * Each person's load before and after the plan. A person carries a subject once however many sections they hold,
 * which matches how the workload engine counts assigned subjects.
 */
export function projectedLoads(faculty: AssignableFaculty[], subjects: PlanSubject[], changes: PlanChange[], measure: "HOURS" | "UNITS") {
  const delta = new Map<string, number>();
  for (const s of subjects) {
    const before = new Set(s.assignments.map((a) => a.facultyId));
    const after = new Set(applyChanges(s.assignments, changes).values());
    const amount = subjectLoad(s, measure);
    for (const id of new Set([...before, ...after])) delta.set(id, (delta.get(id) ?? 0) + (after.has(id) ? amount : 0) - (before.has(id) ? amount : 0));
  }
  return new Map(faculty.filter((f) => delta.get(f.id)).map((f) => [f.id, { before: f.load, after: Math.max(0, f.load + delta.get(f.id)!), limit: f.limit }]));
}

export type LoadTone = "ok" | "warn" | "full";

/** Green under 75% of the limit, amber from 75% up to the limit, red once the limit is reached or passed. */
export function loadTone(load: number, limit: number): LoadTone {
  if (limit <= 0) return "full";
  const ratio = load / limit;
  return ratio >= 1 ? "full" : ratio >= 0.75 ? "warn" : "ok";
}
