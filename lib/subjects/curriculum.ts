import type { Prisma } from "@prisma/client";

/** Explicit program sharing limits a subject; an empty sharing list keeps the general catalog available. */
export function curriculumProgramWhere(programId: string): Prisma.SubjectWhereInput {
  return { OR: [
    { programId },
    { sharedPrograms: { some: { id: programId } } },
    { programId: null, sharedPrograms: { none: {} } },
  ] };
}
