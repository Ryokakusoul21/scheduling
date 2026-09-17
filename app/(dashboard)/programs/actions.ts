"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

const STAFF = ["SUPER_ADMIN", "ADMINISTRATOR", "REGISTRAR"] as const;

const schema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  departmentId: z.string().min(1),
});

export async function createProgramAction(formData: FormData) {
  await requireRole(...STAFF);
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  try {
    await prisma.program.create({ data: parsed.data });
    revalidatePath("/programs");
    return { ok: true };
  } catch {
    return { ok: false, error: "A program with that code already exists." };
  }
}

export async function updateProgramAction(id: string, formData: FormData) {
  await requireRole(...STAFF);
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  await prisma.program.update({ where: { id }, data: parsed.data });
  revalidatePath("/programs");
  return { ok: true };
}

export async function deleteProgramAction(id: string) {
  await requireRole(...STAFF);
  const [sections, subjects, students] = await Promise.all([
    prisma.section.count({ where: { programId: id } }),
    prisma.subject.count({ where: { programId: id } }),
    prisma.student.count({ where: { programId: id } }),
  ]);
  if (sections + subjects + students > 0) {
    return { ok: false, error: "This program is referenced by sections, subjects, or students." };
  }
  await prisma.program.delete({ where: { id } });
  revalidatePath("/programs");
  return { ok: true };
}
