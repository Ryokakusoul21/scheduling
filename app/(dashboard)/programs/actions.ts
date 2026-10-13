"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { canManageDepartment, OUTSIDE_DEPARTMENT, programDepartment, requireScope } from "@/lib/permissions/scope";
import { prisma } from "@/lib/db/prisma";
import { STAFF_ROLES } from "@/lib/permissions/roles";

type Result = { ok: boolean; error?: string };

const schema = z
  .object({
    level: z.enum(["COLLEGE", "SENIOR_HIGH"]),
    code: z.string().trim().min(1, "Code is required").max(20),
    name: z.string().trim().min(1, "Name is required").max(150),
    departmentId: z.string().optional(),
  })
  .refine((d) => d.level !== "COLLEGE" || !!d.departmentId, { message: "Choose the department offering this course", path: ["departmentId"] });

function revalidate(id?: string) {
  revalidatePath("/programs");
  if (id) revalidatePath(`/programs/${id}`);
  revalidatePath("/scheduler");
}

export async function saveProgramAction(id: string | null, formData: FormData): Promise<Result> {
  const scope = await requireScope(...STAFF_ROLES);
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const data = { ...parsed.data, departmentId: scope.isAdmin ? parsed.data.departmentId || null : scope.departmentId };
  if (!canManageDepartment(scope, data.departmentId) || (id && !canManageDepartment(scope, await programDepartment(id)))) return { ok: false, error: OUTSIDE_DEPARTMENT };

  try {
    if (id) {
      await prisma.program.update({ where: { id }, data });
    } else {
      const last = await prisma.program.aggregate({ where: { level: data.level }, _max: { sortOrder: true } });
      await prisma.program.create({ data: { ...data, sortOrder: (last._max.sortOrder ?? -1) + 1 } });
    }
  } catch {
    return { ok: false, error: `A program or strand with the code "${data.code}" already exists.` };
  }
  revalidate(id ?? undefined);
  return { ok: true };
}

export async function deleteProgramAction(id: string): Promise<Result> {
  const scope = await requireScope(...STAFF_ROLES);
  if (!canManageDepartment(scope, await programDepartment(id))) return { ok: false, error: OUTSIDE_DEPARTMENT };
  const [sections, subjects, terms] = await Promise.all([
    prisma.section.count({ where: { programId: id } }),
    prisma.subject.count({ where: { programId: id } }),
    prisma.semester.count({ where: { programId: id } }),
  ]);
  const blockers = [sections && `${sections} section(s)`, subjects && `${subjects} subject(s)`, terms && `${terms} term(s)`].filter(Boolean);
  if (blockers.length) return { ok: false, error: `Still used by ${blockers.join(", ")}. Move or delete those first.` };
  await prisma.program.delete({ where: { id } });
  revalidate();
  return { ok: true };
}
