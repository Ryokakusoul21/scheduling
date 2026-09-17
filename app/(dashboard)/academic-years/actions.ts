"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

const STAFF = ["SUPER_ADMIN", "ADMINISTRATOR", "REGISTRAR"] as const;

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  isActive: z.coerce.boolean().optional(),
});

async function applyActive(id: string, isActive: boolean) {
  if (isActive) {
    await prisma.academicYear.updateMany({ where: { id: { not: id } }, data: { isActive: false } });
  }
}

export async function createAcademicYearAction(formData: FormData) {
  await requireRole(...STAFF);
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const { name, startDate, endDate, isActive } = parsed.data;

  try {
    const created = await prisma.academicYear.create({
      data: { name, startDate: new Date(startDate), endDate: new Date(endDate), isActive: !!isActive },
    });
    await applyActive(created.id, !!isActive);
    revalidatePath("/academic-years");
    return { ok: true };
  } catch {
    return { ok: false, error: "An academic year with that name already exists." };
  }
}

export async function updateAcademicYearAction(id: string, formData: FormData) {
  await requireRole(...STAFF);
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const { name, startDate, endDate, isActive } = parsed.data;

  await prisma.academicYear.update({
    where: { id },
    data: { name, startDate: new Date(startDate), endDate: new Date(endDate), isActive: !!isActive },
  });
  await applyActive(id, !!isActive);
  revalidatePath("/academic-years");
  return { ok: true };
}

export async function deleteAcademicYearAction(id: string) {
  await requireRole(...STAFF);
  const semesterCount = await prisma.semester.count({ where: { academicYearId: id } });
  if (semesterCount > 0) {
    return { ok: false, error: "Remove its semesters first before deleting this academic year." };
  }
  await prisma.academicYear.delete({ where: { id } });
  revalidatePath("/academic-years");
  return { ok: true };
}
