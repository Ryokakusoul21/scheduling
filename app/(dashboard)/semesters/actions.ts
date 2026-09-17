"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

const STAFF = ["SUPER_ADMIN", "ADMINISTRATOR", "REGISTRAR"] as const;

const schema = z.object({
  academicYearId: z.string().min(1),
  type: z.enum(["FIRST", "SECOND", "SUMMER"]),
  name: z.string().min(1),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  isActive: z.coerce.boolean().optional(),
});

async function applyActive(id: string, isActive: boolean) {
  if (isActive) await prisma.semester.updateMany({ where: { id: { not: id } }, data: { isActive: false } });
}

export async function createSemesterAction(formData: FormData) {
  await requireRole(...STAFF);
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const d = parsed.data;
  try {
    const created = await prisma.semester.create({
      data: {
        academicYearId: d.academicYearId,
        type: d.type,
        name: d.name,
        startDate: new Date(d.startDate),
        endDate: new Date(d.endDate),
        isActive: !!d.isActive,
      },
    });
    await applyActive(created.id, !!d.isActive);
    revalidatePath("/semesters");
    return { ok: true };
  } catch {
    return { ok: false, error: "This academic year already has that semester type." };
  }
}

export async function updateSemesterAction(id: string, formData: FormData) {
  await requireRole(...STAFF);
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const d = parsed.data;
  await prisma.semester.update({
    where: { id },
    data: {
      academicYearId: d.academicYearId,
      type: d.type,
      name: d.name,
      startDate: new Date(d.startDate),
      endDate: new Date(d.endDate),
      isActive: !!d.isActive,
    },
  });
  await applyActive(id, !!d.isActive);
  revalidatePath("/semesters");
  return { ok: true };
}

export async function deleteSemesterAction(id: string) {
  await requireRole(...STAFF);
  const scheduleCount = await prisma.schedule.count({ where: { semesterId: id } });
  if (scheduleCount > 0) return { ok: false, error: "This semester has schedules; remove them first." };
  await prisma.semester.delete({ where: { id } });
  revalidatePath("/semesters");
  return { ok: true };
}
