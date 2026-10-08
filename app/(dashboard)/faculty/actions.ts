"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { ACADEMIC_LEVELS } from "@/lib/academics/levels";

const STAFF = ["SUPER_ADMIN", "ADMINISTRATOR", "REGISTRAR", "SCHEDULER"] as const;

/** FormData -> object, keeping repeated keys (checkbox groups) as arrays. */
function formObject(formData: FormData) {
  const out: Record<string, unknown> = Object.fromEntries(formData);
  out.teachingLevels = formData.getAll("teachingLevels");
  return out;
}

const schema = z.object({
  employeeId: z.string().min(1),
  fullName: z.string().min(1),
  email: z.string().email(),
  departmentId: z.string().optional(),
  position: z.string().optional(),
  specialization: z.string().optional(),
  maxHours: z.coerce.number().int().min(1).max(80),
  status: z.enum(["ACTIVE", "INACTIVE", "ON_LEAVE"]),
  teachingLevels: z.array(z.enum(ACADEMIC_LEVELS)).min(1, "Choose at least one teaching level"),
});

function clean(d: z.infer<typeof schema>) {
  return { ...d, departmentId: d.departmentId || null, position: d.position || null, specialization: d.specialization || null };
}

export async function createFacultyAction(formData: FormData) {
  await requireRole(...STAFF);
  const parsed = schema.safeParse(formObject(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  try {
    await prisma.faculty.create({
      data: {
        ...clean(parsed.data),
        availability: {
          create: (["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"] as const).map((d) => ({
            dayOfWeek: d,
            startMin: 7 * 60,
            endMin: 18 * 60,
          })),
        },
      },
    });
    revalidatePath("/faculty");
    return { ok: true };
  } catch {
    return { ok: false, error: "A faculty member with that employee ID or email already exists." };
  }
}

export async function updateFacultyAction(id: string, formData: FormData) {
  await requireRole(...STAFF);
  const parsed = schema.safeParse(formObject(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  try {
    await prisma.faculty.update({ where: { id }, data: clean(parsed.data) });
  } catch {
    return { ok: false, error: "Another faculty member already uses that employee ID or email." };
  }
  revalidatePath("/faculty");
  return { ok: true };
}

export async function deleteFacultyAction(id: string) {
  await requireRole(...STAFF);
  const [scheduleCount, linkedUser] = await Promise.all([
    prisma.schedule.count({ where: { facultyId: id } }),
    prisma.user.findUnique({ where: { facultyId: id } }),
  ]);
  if (scheduleCount > 0) return { ok: false, error: "This faculty member has existing schedule assignments." };
  if (linkedUser) return { ok: false, error: "This faculty member has a linked user login; remove that account first." };
  await prisma.faculty.delete({ where: { id } });
  revalidatePath("/faculty");
  return { ok: true };
}
