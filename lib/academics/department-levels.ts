import "server-only";
import { PROGRAM_CATALOG_FILTER, ACADEMIC_LEVELS, type AcademicLevel } from "@/lib/academics/levels";
import { prisma } from "@/lib/db/prisma";
import { departmentWhere } from "@/lib/permissions/department";
import type { requireScope } from "@/lib/permissions/scope";

/** For a Head of Department, the levels their department teaches; null for every other role. */
export async function headLevels(scope: Awaited<ReturnType<typeof requireScope>>): Promise<AcademicLevel[] | null> {
  if (scope.role !== "HEAD_OF_DEPARTMENT") return null;
  const rows = await prisma.program.findMany({ where: { AND: [PROGRAM_CATALOG_FILTER, departmentWhere.program(scope)] }, select: { level: true }, distinct: ["level"] });
  return ACADEMIC_LEVELS.filter((level) => rows.some((row) => row.level === level));
}
