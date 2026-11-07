import "server-only";
import type { AcademicLevel } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { departmentWhere } from "./department";
import type { Scope } from "./scope";

/** Levels (and programs, when restricted) a person handles; null means not narrowed. */
export interface Handled {
  levels: AcademicLevel[];
  programIds: Set<string> | null;
}

/** Head of Department: their scoped programs and sections. Faculty: the levels they teach. Everyone else is not narrowed. */
export async function handledScope(scope: Scope): Promise<Handled | null> {
  if (scope.role === "FACULTY" && scope.facultyId) {
    const faculty = await prisma.faculty.findUnique({ where: { id: scope.facultyId }, select: { teachingLevels: true } });
    return faculty?.teachingLevels.length ? { levels: faculty.teachingLevels, programIds: null } : null;
  }
  if (scope.role !== "HEAD_OF_DEPARTMENT") return null;
  const [programs, sections] = await Promise.all([
    prisma.program.findMany({ where: departmentWhere.program(scope), select: { id: true, level: true } }),
    prisma.section.findMany({ where: departmentWhere.section(scope), select: { level: true }, distinct: ["level"] }),
  ]);
  return { levels: [...new Set([...programs.map((p) => p.level), ...sections.map((s) => s.level)])], programIds: new Set(programs.map((p) => p.id)) };
}

/** A term belongs to the handled scope when its level is handled and it is not tied to another program. */
export function handlesTerm(handled: Handled | null, term: { level: AcademicLevel; programId: string | null }) {
  return !handled || (handled.levels.includes(term.level) && (!term.programId || !handled.programIds || handled.programIds.has(term.programId)));
}
