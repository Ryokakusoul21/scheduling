import "server-only";
import type { Prisma } from "@prisma/client";
import { offeringMatches } from "./offerings";

export class AssignmentCurriculumError extends Error {}
export type AssignmentSlot = { sectionId: string; subjectId: string; semesterId: string };

/** An active, validated assignment makes each required component ready to schedule. Never removes queue rows. */
export async function syncAssignedCurriculum(db: Prisma.TransactionClient, slots: AssignmentSlot[]) {
  if (!slots.length) return 0;
  const rows = await db.subjectAssignment.findMany({
    where: { status: "ACTIVE", OR: slots },
    include: { subject: { include: { sharedPrograms: { select: { id: true } } } }, section: true, semester: true },
  });
  const data: { sectionId: string; subjectId: string; component: "LECTURE" | "LABORATORY" }[] = [];
  for (const row of rows) {
    if (!row.section || row.section.archivedAt || row.subject.archivedAt ||
      !offeringMatches({ ...row.subject, sharedProgramIds: row.subject.sharedPrograms.map((p) => p.id) }, row.section, row.semester) ||
      (row.semester.programId && row.semester.programId !== row.section.programId)) {
      throw new AssignmentCurriculumError("The assigned subject no longer matches this section's curriculum and term. Review the assignment in Subjects.");
    }
    if (row.subject.lectureHours > 0) data.push({ sectionId: row.section.id, subjectId: row.subjectId, component: "LECTURE" });
    if (row.subject.labHours > 0) data.push({ sectionId: row.section.id, subjectId: row.subjectId, component: "LABORATORY" });
  }
  if (!data.length) return 0;
  return (await db.sectionClassPlaceholder.createMany({ data, skipDuplicates: true })).count;
}
