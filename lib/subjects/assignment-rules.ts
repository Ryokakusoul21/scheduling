import { z } from "zod";
import { projectionWarning } from "@/lib/workload/projection";

/** Shared by the assign dialog and the server action so both validate the same way. */
export const assignmentSchema = z.object({
  subjectIds: z.array(z.string().min(1)).min(1, "Choose at least one subject").max(100),
  facultyId: z.string().min(1, "Choose a faculty member"),
  sectionId: z.string().optional().transform((v) => v || null),
  semesterId: z.string().min(1, "Choose a term"),
});
export type AssignmentInput = z.input<typeof assignmentSchema>;

/** A faculty member as the dialog lists them, with this term's load already counted. */
export type AssignableFaculty = {
  id: string; name: string; email: string; employeeId: string; departmentId: string | null; departmentName: string;
  specialization: string | null; employmentType: "FULL_TIME" | "PART_TIME";
  /** Scheduled classes plus assigned subjects not yet scheduled, in the workload measure. */
  load: number; minimum: number; limit: number;
  /** Reported unavailability (not dismissed) that overlaps the term, already formatted. */
  unavailability: string[];
};

export type AssignableSubject = { code: string; units: number; lectureHours: number; labHours: number; departmentId: string | null; departmentName: string | null };

/** Amount one subject adds to a load in the configured measure. */
export function subjectLoad(subject: Pick<AssignableSubject, "units" | "lectureHours" | "labHours">, measure: "HOURS" | "UNITS") {
  return measure === "HOURS" ? subject.lectureHours + subject.labHours : subject.units;
}

/** Non-blocking warnings with projected loads for giving these subjects to this faculty member (and taking them from `losing`). */
export function assignmentWarnings(faculty: AssignableFaculty, subjects: AssignableSubject[], measure: "HOURS" | "UNITS", losing: { faculty: AssignableFaculty; subjects: AssignableSubject[] }[] = []) {
  const warnings: string[] = [];
  const unit = measure === "HOURS" ? "hours" : "units";
  const sum = (list: AssignableSubject[]) => list.reduce((n, s) => n + subjectLoad(s, measure), 0);
  const gain = projectionWarning({ ...faculty, maximum: faculty.limit }, sum(subjects), unit);
  if (gain) warnings.push(gain);
  for (const l of losing) {
    const loss = projectionWarning({ ...l.faculty, maximum: l.faculty.limit }, -sum(l.subjects), unit);
    if (loss) warnings.push(loss);
  }
  const foreign = subjects.filter((s) => s.departmentId && s.departmentId !== faculty.departmentId);
  if (foreign.length) {
    const specialization = faculty.specialization ? ` (specialization: ${faculty.specialization})` : "";
    warnings.push(`${faculty.name} belongs to ${faculty.departmentName}${specialization}, but ${foreign.map((s) => s.code).join(", ")} ${foreign.length > 1 ? "are" : "is"} owned by ${foreign[0].departmentName}.`);
  }
  for (const u of faculty.unavailability) warnings.push(`${faculty.name} reported unavailability during this term: ${u}.`);
  return warnings;
}

/** The assigned faculty for a class, or null when the subject is unassigned. */
export function assignedFor(rows: { subjectId: string; sectionId: string | null; facultyId: string }[], subjectId: string, sectionId: string) {
  return (rows.find((r) => r.subjectId === subjectId && r.sectionId === sectionId) ?? rows.find((r) => r.subjectId === subjectId && !r.sectionId))?.facultyId ?? null;
}
