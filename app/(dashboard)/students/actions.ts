"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

const STAFF = ["SUPER_ADMIN", "ADMINISTRATOR", "REGISTRAR"] as const;

const schema = z.object({
  studentNumber: z.string().min(1),
  fullName: z.string().min(1),
  email: z.string().email(),
  programId: z.string().optional(),
  yearLevel: z.enum(["FIRST", "SECOND", "THIRD", "FOURTH", "FIFTH"]).optional().or(z.literal("")),
  sectionId: z.string().optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "GRADUATED", "DROPPED"]),
});

function clean(d: z.infer<typeof schema>) {
  return {
    ...d,
    programId: d.programId || null,
    yearLevel: d.yearLevel || null,
    sectionId: d.sectionId || null,
  };
}

export async function createStudentAction(formData: FormData) {
  await requireRole(...STAFF);
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  try {
    await prisma.student.create({ data: clean(parsed.data) });
    revalidatePath("/students");
    return { ok: true };
  } catch {
    return { ok: false, error: "A student with that number or email already exists." };
  }
}

export async function updateStudentAction(id: string, formData: FormData) {
  await requireRole(...STAFF);
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  await prisma.student.update({ where: { id }, data: clean(parsed.data) });
  revalidatePath("/students");
  return { ok: true };
}

export async function deleteStudentAction(id: string) {
  await requireRole(...STAFF);
  const linkedUser = await prisma.user.findUnique({ where: { studentId: id } });
  if (linkedUser) return { ok: false, error: "This student has a linked user login; remove that account first." };
  await prisma.student.delete({ where: { id } });
  revalidatePath("/students");
  return { ok: true };
}
