import "server-only";
import type { Prisma } from "@prisma/client";
import { can } from "@/lib/permissions/policy";
import { policyUserFromScope, type Scope } from "@/lib/permissions/scope";
import { curriculumProgramWhere } from "@/lib/subjects/curriculum";

export class CurriculumError extends Error {}

/** Initialize an empty queue only; existing approved components and remembered choices stay intact. */
export async function linkEmptySectionCurriculum(db: Prisma.TransactionClient, scope: Scope, sectionId: string) {
  const section = await db.section.findUnique({
    where: { id: sectionId },
    include: { semester: true, _count: { select: { classPlaceholders: true } } },
  });
  if (!section || section.archivedAt || !can(policyUserFromScope(scope), "edit", { type: "section", ...section })) {
    throw new CurriculumError("You can only load curriculum for sections you manage.");
  }
  if (section._count.classPlaceholders > 0) return 0;
  const term = section.semester;
  if ((section.level === "COLLEGE" && !term) || (term && (term.level !== section.level || (term.programId && term.programId !== section.programId)))) {
    throw new CurriculumError("Choose a matching academic term for this section before loading its curriculum.");
  }
  const subjects = await db.subject.findMany({
    where: {
      archivedAt: null,
      level: section.level,
      AND: [
        section.programId ? curriculumProgramWhere(section.programId) : { programId: null, sharedPrograms: { none: {} } },
        section.level === "COLLEGE"
          ? { OR: [{ yearLevel: section.yearLevel }, { yearLevel: null }] }
          : { OR: [{ gradeLevel: section.gradeLevel }, { gradeLevel: null }] },
        ...(term ? [{ OR: [{ semester: term.type }, { semester: null }] }] : []),
      ],
    },
    select: { id: true, lectureHours: true, labHours: true },
  });
  const data = subjects.flatMap((subject) => [
    ...(subject.lectureHours > 0 ? [{ sectionId, subjectId: subject.id, component: "LECTURE" as const }] : []),
    ...(subject.labHours > 0 ? [{ sectionId, subjectId: subject.id, component: "LABORATORY" as const }] : []),
  ]);
  if (!data.length) return 0;
  return (await db.sectionClassPlaceholder.createMany({ data, skipDuplicates: true })).count;
}
