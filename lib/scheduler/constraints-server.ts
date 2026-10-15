import "server-only";
import { prisma } from "@/lib/db/prisma";
import { checkAll, checkEntry, type ConstraintContext, type ConstraintRule } from "./constraints";
import { concurrentTermIds } from "./term-conflicts";
import { toSchedEntry } from "./mappers";
import type { SchedEntry } from "./types";

/** Enabled constraints in the order they are reported. */
export async function activeRules(): Promise<ConstraintRule[]> {
  const rows = await prisma.schedulingConstraint.findMany({ where: { enabled: true }, orderBy: { createdAt: "asc" } });
  return rows.map((r) => ({ id: r.id, kind: r.kind, name: r.name, params: r.params, departmentId: r.departmentId }));
}

async function loadContext(): Promise<ConstraintContext> {
  const [rooms, sections, subjects, faculty, programs] = await Promise.all([
    prisma.room.findMany({ select: { id: true, roomName: true, capacity: true, isGeneralShared: true, programs: { select: { id: true } } } }),
    prisma.section.findMany({ select: { id: true, name: true, studentCount: true, programId: true, program: { select: { departmentId: true } } } }),
    prisma.subject.findMany({ select: { id: true, code: true, name: true } }),
    prisma.faculty.findMany({ select: { id: true, fullName: true } }),
    prisma.program.findMany({ select: { id: true, name: true } }),
  ]);
  return {
    rooms: new Map(rooms.map((r) => [r.id, { name: r.roomName, capacity: r.capacity, isGeneralShared: r.isGeneralShared, programIds: r.programs.map((p) => p.id) }])),
    sections: new Map(sections.map((s) => [s.id, { name: s.name, studentCount: s.studentCount, programId: s.programId, departmentId: s.program?.departmentId ?? null }])),
    subjects: new Map(subjects.map((s) => [s.id, { code: s.code, name: s.name }])),
    faculty: new Map(faculty.map((f) => [f.id, { name: f.fullName }])),
    programNames: new Map(programs.map((p) => [p.id, p.name])),
  };
}

async function classesInTerms(termIds: string[]) {
  const rows = await prisma.schedule.findMany({ where: { semesterId: { in: termIds }, status: { not: "ARCHIVED" } } });
  return rows.map(toSchedEntry);
}

/** Violations for one class being created (no id) or changed (id excluded from the others). */
export async function checkClassConstraints(entry: SchedEntry & { semesterId: string }, excludeId?: string) {
  const rules = await activeRules();
  if (rules.length === 0) return [];
  const [ctx, others] = await Promise.all([loadContext(), concurrentTermIds(entry.semesterId).then(classesInTerms)]);
  return checkEntry({ ...entry, id: excludeId }, others.filter((o) => o.id !== excludeId), rules, ctx);
}

/** Constraint report for every class of a term and the terms running at the same time. */
export async function termConstraintReport(termId: string, departmentId?: string | null) {
  const [rules, ctx, entries] = await Promise.all([activeRules(), loadContext(), concurrentTermIds(termId).then(classesInTerms)]);
  const violations = checkAll(entries, rules, ctx);
  if (!departmentId) return violations;
  // A Head of Department sees findings that involve at least one class of their department.
  const own = new Set(entries.filter((e) => ctx.sections.get(e.sectionId)?.departmentId === departmentId).map((e) => e.id));
  return violations.filter((v) => v.entryIds.some((id) => own.has(id)));
}
