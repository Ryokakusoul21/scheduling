"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

const STAFF = ["SUPER_ADMIN", "ADMINISTRATOR", "REGISTRAR", "SCHEDULER"] as const;

const schema = z.object({
  name: z.string().min(1),
  programId: z.string().min(1),
  yearLevel: z.enum(["FIRST", "SECOND", "THIRD", "FOURTH", "FIFTH"]),
  studentCount: z.coerce.number().int().min(0),
  semesterId: z.string().optional(),
});

export async function createSectionAction(formData: FormData) {
  await requireRole(...STAFF);
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const d = parsed.data;
  try {
    await prisma.section.create({
      data: { ...d, semesterId: d.semesterId || null },
    });
    revalidatePath("/sections");
    return { ok: true };
  } catch {
    return { ok: false, error: "A section with that name already exists in that semester." };
  }
}

export async function updateSectionAction(id: string, formData: FormData) {
  await requireRole(...STAFF);
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const d = parsed.data;
  await prisma.section.update({ where: { id }, data: { ...d, semesterId: d.semesterId || null } });
  revalidatePath("/sections");
  return { ok: true };
}

export async function deleteSectionAction(id: string) {
  await requireRole(...STAFF);
  const [students, schedules] = await Promise.all([
    prisma.student.count({ where: { sectionId: id } }),
    prisma.schedule.count({ where: { sectionId: id } }),
  ]);
  if (students + schedules > 0) return { ok: false, error: "This section has students or schedules linked to it." };
  await prisma.section.delete({ where: { id } });
  revalidatePath("/sections");
  return { ok: true };
}
