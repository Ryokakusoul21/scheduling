"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { OUTSIDE_DEPARTMENT, requireScope } from "@/lib/permissions/scope";
import { canManageSection } from "@/lib/sections/permissions";
import { distributeLearners, generateSectionNames, nextSectionIndex } from "@/lib/sections/generation";
import { logBlocked, recordDepartment } from "@/lib/permissions/department";
import { prisma } from "@/lib/db/prisma";
import { queueWorkloadCheck } from "@/lib/workload/auto";
import { STAFF_ROLES } from "@/lib/permissions/roles";
import { ACADEMIC_LEVELS, GRADE_LEVELS, LEVELS, YEAR_LEVELS } from "@/lib/academics/levels";

type Result = { ok: boolean; error?: string; batchId?: string; created?: number };

const schema = z
  .object({
    name: z.string().trim().min(1, "Section name is required").max(60),
    studentCount: z.coerce.number().int().min(0, "Enrollment can't be negative").max(200),
    level: z.enum(ACADEMIC_LEVELS),
    programId: z.string().optional(),
    yearLevel: z.enum(YEAR_LEVELS).optional().or(z.literal("")),
    gradeLevel: z.enum(GRADE_LEVELS).optional().or(z.literal("")),
    semesterId: z.string().optional(),
  })
  .refine((d) => d.level !== "COLLEGE" || (!!d.programId && !!d.yearLevel), { message: "College sections need a course and year level" })
  .refine((d) => d.level === "COLLEGE" || (!!d.gradeLevel && LEVELS[d.level].grades.includes(d.gradeLevel)), {
    message: "Choose a grade level that belongs to this academic level",
  })
  .refine((d) => d.level !== "SENIOR_HIGH" || !!d.programId, { message: "Senior High sections need a strand" });

export async function saveSectionAction(id: string | null, formData: FormData): Promise<Result> {
  const scope = await requireScope(...STAFF_ROLES);
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const d = parsed.data;
  const usesProgram = LEVELS[d.level].usesPrograms;
  const data = {
    name: d.name,
    studentCount: d.studentCount,
    level: d.level,
    programId: usesProgram ? d.programId || null : null,
    yearLevel: d.level === "COLLEGE" ? d.yearLevel || null : null,
    gradeLevel: d.level === "COLLEGE" ? null : d.gradeLevel || null,
    semesterId: d.level === "COLLEGE" ? d.semesterId || null : null,
  };

  // Sections belong to the department of their course or strand, or of their basic-education level.
  const existing = id ? await prisma.section.findUnique({ where: { id }, select: { departmentId: true } }) : null;
  const departmentId = await recordDepartment(scope, data.programId, data.level, existing?.departmentId);
  const actor = scope;
  if (!canManageSection(actor, { departmentId }) || (existing && !canManageSection(actor, existing))) {
    await logBlocked(scope, "save a section outside the department", "Section", id);
    return { ok: false, error: OUTSIDE_DEPARTMENT };
  }

  const duplicate = await prisma.section.findFirst({
    where: { name: { equals: data.name, mode: "insensitive" }, level: data.level, programId: data.programId, yearLevel: data.yearLevel, semesterId: data.semesterId, id: id ? { not: id } : undefined },
  });
  if (duplicate) return { ok: false, error: `A section named "${data.name}" already exists here.` };

  if (id) await prisma.section.update({ where: { id }, data: { ...data, departmentId } });
  else {
    const last = await prisma.section.aggregate({ _max: { sortOrder: true } });
    await prisma.section.create({ data: { ...data, departmentId, sortOrder: (last._max.sortOrder ?? -1) + 1 } });
  }
  revalidatePath("/sections");
  revalidatePath("/scheduler");
  queueWorkloadCheck("A section was opened or changed");
  return { ok: true };
}
const generationSchema = z.object({
  programId: z.string().min(1), yearLevel: z.enum(YEAR_LEVELS), semesterId: z.string().min(1), totalLearners: z.number().int().min(1).max(10000),
  maximum: z.number().int().min(1).max(500), pattern: z.enum(["NAME", "CODE"]), linkCurriculum: z.boolean(), mode: z.enum(["ADD", "REBALANCE"]),
});

export async function generateSectionsAction(input: z.infer<typeof generationSchema>): Promise<Result> {
  const scope = await requireScope(...STAFF_ROLES);
  const parsed = generationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the generation values." };
  const d = parsed.data;
  const [program, term] = await Promise.all([
    prisma.program.findUnique({ where: { id: d.programId }, select: { id: true, code: true, name: true, departmentId: true } }),
    prisma.semester.findUnique({ where: { id: d.semesterId }, select: { id: true, type: true, level: true, programId: true } }),
  ]);
  const actor = scope;
  if (!program || !term || term.level !== "COLLEGE" || (term.programId && term.programId !== program.id)) return { ok: false, error: "Choose a valid program and academic term." };
  if (!canManageSection(actor, { departmentId: program.departmentId })) {
    await logBlocked(scope, "auto-generate sections outside the department", "Section");
    return { ok: false, error: OUTSIDE_DEPARTMENT };
  }
  const existing = await prisma.section.findMany({ where: { programId: program.id, yearLevel: d.yearLevel, semesterId: term.id, archivedAt: null }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  const distribution = distributeLearners(d.totalLearners, d.maximum);
  if (!distribution.length) return { ok: false, error: "Total learners and maximum learners per section must be greater than zero." };
  if (d.mode === "ADD" && distribution.length <= existing.length) return { ok: false, error: "Enough sections already exist for this cohort. Choose rebalance to update their learner counts." };
  if (d.mode === "REBALANCE" && distribution.length < existing.length) return { ok: false, error: "This cohort already has more sections than the selected maximum requires. Increase total learners or choose a smaller maximum." };
  if (d.mode === "REBALANCE" && distribution.length < existing.length) return { ok: false, error: "The requested maximum would require fewer sections than already exist. Archive extra sections first or use a lower maximum." };
  const prefix = d.pattern === "CODE" ? program.code : program.name;
  const yearNumber = YEAR_LEVELS.indexOf(d.yearLevel) + 1;
  const newCounts = distribution.slice(existing.length);
  const names = generateSectionNames(prefix, yearNumber, newCounts.length, nextSectionIndex(existing.map((section) => section.name)));
  const collision = await prisma.section.findFirst({ where: { semesterId: term.id, programId: program.id, yearLevel: d.yearLevel, name: { in: names, mode: "insensitive" } } });
  if (collision) return { ok: false, error: `A section named "${collision.name}" already exists in this program, year level, and term.` };
  const subjects = d.linkCurriculum ? await prisma.subject.findMany({
    where: { archivedAt: null, yearLevel: d.yearLevel, OR: [{ programId: program.id }, { sharedPrograms: { some: { id: program.id } } }], AND: [{ OR: [{ semester: term.type }, { semester: null }] }] },
    select: { id: true, lectureHours: true, labHours: true }, orderBy: { sortOrder: "asc" },
  }) : [];
  const batchId = crypto.randomUUID();
  const created = await prisma.$transaction(async (tx) => {
    if (d.mode === "REBALANCE") await Promise.all(existing.map((section, index) => tx.section.update({ where: { id: section.id }, data: { studentCount: distribution[index] } })));
    const rows = names.map((name, index) => ({ id: crypto.randomUUID(), name, studentCount: newCounts[index], level: "COLLEGE" as const, programId: program.id, departmentId: program.departmentId, yearLevel: d.yearLevel, semesterId: term.id, generationBatchId: batchId, sortOrder: existing.length + index }));
    if (rows.length) await tx.section.createMany({ data: rows });
    const placeholders = rows.flatMap((section) => subjects.flatMap((subject) => [
      ...(subject.lectureHours > 0 ? [{ sectionId: section.id, subjectId: subject.id, component: "LECTURE" as const }] : []),
      ...(subject.labHours > 0 ? [{ sectionId: section.id, subjectId: subject.id, component: "LABORATORY" as const }] : []),
    ]));
    if (placeholders.length) await tx.sectionClassPlaceholder.createMany({ data: placeholders, skipDuplicates: true });
    await tx.auditLog.create({ data: { userId: scope.userId, action: `Auto-generated ${rows.length} section(s)`, entity: "Section", newValue: { batchId, programId: program.id, yearLevel: d.yearLevel, semesterId: term.id, mode: d.mode, totalLearners: d.totalLearners } } });
    return rows;
  });
  revalidatePath("/sections"); revalidatePath("/scheduler"); queueWorkloadCheck("Sections were auto-generated");
  return { ok: true, batchId, created: created.length };
}

export async function undoSectionGenerationAction(batchId: string): Promise<Result> {
  const scope = await requireScope(...STAFF_ROLES);
  if (!batchId) return { ok: false, error: "Generation batch is missing." };
  const sections = await prisma.section.findMany({ where: { generationBatchId: batchId }, select: { id: true, departmentId: true, _count: { select: { schedules: true, students: true } } } });
  if (!sections.length) return { ok: false, error: "These generated sections were already removed." };
  const actor = scope;
  if (sections.some((section) => !canManageSection(actor, section))) { await logBlocked(scope, "undo section generation outside the department", "Section"); return { ok: false, error: OUTSIDE_DEPARTMENT }; }
  if (sections.some((section) => section._count.schedules || section._count.students)) return { ok: false, error: "Undo is unavailable after classes are scheduled or learners are enrolled. Archive the sections instead." };
  await prisma.$transaction(async (tx) => { await tx.section.deleteMany({ where: { generationBatchId: batchId } }); await tx.auditLog.create({ data: { userId: scope.userId, action: "Undid automatic section generation", entity: "Section", newValue: { batchId } } }); });
  revalidatePath("/sections"); revalidatePath("/scheduler");
  return { ok: true };
}
