"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { OUTSIDE_DEPARTMENT, policyUserFromScope, requireScope } from "@/lib/permissions/scope";
import { can } from "@/lib/permissions/policy";
import { generateSectionBatch, sectionGenerationContext, undoSectionBatch } from "@/lib/sections/generation-service";
import { CurriculumError, linkEmptySectionCurriculum } from "@/lib/sections/curriculum-service";
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
  .refine((d) => d.level !== "COLLEGE" || !!d.semesterId, { message: "Choose an academic term for this college section" })
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
  const existing = id ? await prisma.section.findUnique({ where: { id }, select: { departmentId: true, programId: true, archivedAt: true } }) : null;
  const departmentId = await recordDepartment(scope, data.programId, data.level, existing?.departmentId);
  const actor = policyUserFromScope(scope);
  if (!can(actor, "edit", { type: "section", departmentId, programId: data.programId }) || (existing && (existing.archivedAt || !can(actor, "edit", { type: "section", ...existing })))) {
    await logBlocked(scope, "save a section outside the department", "Section", id);
    return { ok: false, error: OUTSIDE_DEPARTMENT };
  }

  const duplicate = await prisma.section.findFirst({
    where: { name: { equals: data.name, mode: "insensitive" }, level: data.level, programId: data.programId, yearLevel: data.yearLevel, semesterId: data.semesterId, id: id ? { not: id } : undefined },
  });
  if (duplicate) return { ok: false, error: `A section named "${data.name}" already exists here.` };

  try {
    if (id) await prisma.section.update({ where: { id }, data: { ...data, departmentId } });
    else {
      await prisma.$transaction(async (tx) => {
        const last = await tx.section.aggregate({ _max: { sortOrder: true } });
        const section = await tx.section.create({ data: { ...data, departmentId, sortOrder: (last._max.sortOrder ?? -1) + 1 } });
        await linkEmptySectionCurriculum(tx, scope, section.id);
      });
    }
  } catch (error) {
    if (error instanceof CurriculumError) return { ok: false, error: error.message };
    throw error;
  }
  revalidatePath("/sections");
  revalidatePath("/scheduler");
  queueWorkloadCheck("A section was opened or changed");
  return { ok: true };
}

export async function loadSectionCurriculumAction(sectionId: string) {
  const scope = await requireScope(...STAFF_ROLES);
  if (typeof sectionId !== "string" || !sectionId) return { ok: false as const, error: "Choose a section." };
  try {
    const created = await prisma.$transaction((tx) => linkEmptySectionCurriculum(tx, scope, sectionId));
    revalidatePath("/sections");
    revalidatePath("/scheduler");
    if (created) queueWorkloadCheck("Section curriculum was loaded");
    return { ok: true as const, created };
  } catch (error) {
    if (error instanceof CurriculumError) return { ok: false as const, error: error.message };
    throw error;
  }
}
export async function loadSectionGenerationContextAction(input: unknown) {
  return sectionGenerationContext(await requireScope(...STAFF_ROLES), input);
}

export async function generateSectionsAction(input: unknown) {
  const result = await generateSectionBatch(await requireScope(...STAFF_ROLES), input);
  if (result.ok) {
    revalidatePath("/sections"); revalidatePath("/scheduler");
    queueWorkloadCheck("Sections were auto-generated");
  }
  return result;
}

export async function undoSectionGenerationAction(batchId: string) {
  const result = await undoSectionBatch(await requireScope(...STAFF_ROLES), batchId);
  if (result.ok) {
    revalidatePath("/sections"); revalidatePath("/scheduler");
    queueWorkloadCheck("Automatic section generation was undone");
  }
  return result;
}
