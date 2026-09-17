"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

const STAFF = ["SUPER_ADMIN", "ADMINISTRATOR", "REGISTRAR", "SCHEDULER"] as const;

const schema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  units: z.coerce.number().min(0),
  lectureHours: z.coerce.number().min(0),
  labHours: z.coerce.number().min(0),
  requiredRoomType: z.enum(["LECTURE_ROOM", "COMPUTER_LABORATORY", "SCIENCE_LABORATORY", "CONFERENCE_ROOM", "OTHER"]),
  programId: z.string().optional(),
  yearLevel: z.enum(["FIRST", "SECOND", "THIRD", "FOURTH", "FIFTH"]).optional().or(z.literal("")),
});

function clean(data: z.infer<typeof schema>) {
  return {
    ...data,
    programId: data.programId || null,
    yearLevel: data.yearLevel || null,
    description: data.description || null,
  };
}

export async function createSubjectAction(formData: FormData) {
  await requireRole(...STAFF);
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  try {
    await prisma.subject.create({ data: clean(parsed.data) });
    revalidatePath("/subjects");
    return { ok: true };
  } catch {
    return { ok: false, error: "A subject with that code already exists." };
  }
}

export async function updateSubjectAction(id: string, formData: FormData) {
  await requireRole(...STAFF);
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  await prisma.subject.update({ where: { id }, data: clean(parsed.data) });
  revalidatePath("/subjects");
  return { ok: true };
}

export async function deleteSubjectAction(id: string) {
  await requireRole(...STAFF);
  const scheduleCount = await prisma.schedule.count({ where: { subjectId: id } });
  if (scheduleCount > 0) return { ok: false, error: "This subject is used in existing schedules." };
  await prisma.subject.delete({ where: { id } });
  revalidatePath("/subjects");
  return { ok: true };
}
