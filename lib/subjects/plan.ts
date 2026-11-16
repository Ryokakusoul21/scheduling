import { z } from "zod";
import { subjectLoad, type AssignableFaculty, type AssignableSubject } from "./assignment-rules";

/** One section's teacher after saving; a null faculty removes the current teacher. */
export type PlanChange = { sectionId: string; facultyId: string | null };

/** Shared by the assign modal and the server action so both validate the same way. */
export const planSchema = z.object({
  subjectIds: z.array(z.string().min(1)).min(1, "Choose at least one subject").max(100),
  semesterId: z.string().min(1, "Choose a term"),
  changes: z
    .array(z.object({ sectionId: z.string().min(1, "Choose a specific section"), facultyId: z.string().min(1).nullable() }))
    .min(1, "Choose at least one change")
    .max(200),
});
export type PlanInput = z.input<typeof planSchema>;

export type PlanSubject = AssignableSubject & {
  id: string; assignments: { facultyId: string; sectionId: string | null }[];
  progress?: { sectionId: string; scheduledHours: number; taughtByOthers?: string[] }[];
};

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
 * Count each section offering separately. Existing scheduled meetings stay with their teacher;
 * changing an assignment transfers only its remaining, unscheduled curriculum hours.
 */
export function projectedLoads(faculty: AssignableFaculty[], subjects: PlanSubject[], changes: PlanChange[], measure: "HOURS" | "UNITS") {
  const delta = new Map<string, number>();
  for (const s of subjects) {
    const before = applyChanges(s.assignments.filter((a) => a.sectionId), []);
    const after = applyChanges(s.assignments.filter((a) => a.sectionId), changes);
    for (const sectionId of new Set([...before.keys(), ...after.keys()])) {
      const requiredHours = s.lectureHours + s.labHours;
      const scheduled = s.progress?.find((p) => p.sectionId === sectionId)?.scheduledHours ?? 0;
      const remaining = Math.max(0, requiredHours - scheduled);
      const amount = measure === "HOURS" ? remaining : requiredHours > 0 ? subjectLoad(s, measure) * remaining / requiredHours : subjectLoad(s, measure);
      const from = before.get(sectionId), to = after.get(sectionId);
      if (from === to) continue;
      if (from) delta.set(from, (delta.get(from) ?? 0) - amount);
      if (to) delta.set(to, (delta.get(to) ?? 0) + amount);
    }
  }
  return new Map(faculty.filter((f) => delta.get(f.id)).map((f) => [f.id, { before: f.load, after: Math.round(Math.max(0, f.load + delta.get(f.id)!) * 10) / 10, limit: f.limit }]));
}

export type LoadTone = "ok" | "warn" | "full";

/** Green under 75% of the limit, amber from 75% up to the limit, red once the limit is reached or passed. */
export function loadTone(load: number, limit: number): LoadTone {
  if (limit <= 0) return "full";
  const ratio = load / limit;
  return ratio >= 1 ? "full" : ratio >= 0.75 ? "warn" : "ok";
}
