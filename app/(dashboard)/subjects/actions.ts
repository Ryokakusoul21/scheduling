"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { canManageDepartment, OUTSIDE_DEPARTMENT, programDepartment, requireScope } from "@/lib/permissions/scope";
import { prisma } from "@/lib/db/prisma";
import { queueWorkloadCheck } from "@/lib/workload/auto";
import { STAFF_ROLES } from "@/lib/permissions/roles";
import { ACADEMIC_LEVELS, GRADE_LEVELS, LEVELS, YEAR_LEVELS } from "@/lib/academics/levels";

type Result = { ok: boolean; error?: string };

const schema = z
  .object({
    code: z.string().trim().min(1, "Code is required").max(30),
    name: z.string().trim().min(1, "Name is required").max(150),
    description: z.string().max(500).optional(),
    units: z.coerce.number().min(0, "Units can't be negative").max(30),
    lectureHours: z.coerce.number().min(0).max(40),
    labHours: z.coerce.number().min(0).max(40),
    requiredRoomType: z.enum(["LECTURE_ROOM", "COMPUTER_LABORATORY", "SCIENCE_LABORATORY", "CONFERENCE_ROOM", "OTHER"]),
    level: z.enum(ACADEMIC_LEVELS),
    programId: z.string().optional(),
    yearLevel: z.enum(YEAR_LEVELS).optional().or(z.literal("")),
    gradeLevel: z.enum(GRADE_LEVELS).optional().or(z.literal("")),
  })
  .refine((d) => d.lectureHours + d.labHours > 0, { message: "Add lecture or lab hours per week" })
  .refine((d) => d.level === "COLLEGE" || (!!d.gradeLevel && LEVELS[d.level].grades.includes(d.gradeLevel)), {
    message: "Choose a grade level that belongs to this academic level",
  });

async function clean(d: z.infer<typeof schema>) {
  let programId = d.programId || null;
  if (d.level === "JUNIOR_HIGH" || d.level === "ELEMENTARY") programId = null;
  if (programId) {
    const program = await prisma.program.findUnique({ where: { id: programId }, select: { level: true } });
    if (!program || program.level !== d.level) programId = null;
  }
  return {
    code: d.code,
    name: d.name,
    description: d.description || null,
    units: d.units,
    lectureHours: d.lectureHours,
    labHours: d.labHours,
    requiredRoomType: d.requiredRoomType,
    level: d.level,
    programId,
    yearLevel: d.level === "COLLEGE" ? d.yearLevel || null : null,
    gradeLevel: d.level === "COLLEGE" ? null : d.gradeLevel || null,
  };
}

export async function saveSubjectAction(id: string | null, formData: FormData): Promise<Result> {
  const scope = await requireScope(...STAFF_ROLES);
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const data = await clean(parsed.data);
  // Subjects of a course or strand belong to its department; general subjects are the Administrator's.
  const existing = id ? await prisma.subject.findUnique({ where: { id }, select: { programId: true } }) : null;
  if (!canManageDepartment(scope, await programDepartment(data.programId)) || (existing && !canManageDepartment(scope, await programDepartment(existing.programId)))) {
    return { ok: false, error: OUTSIDE_DEPARTMENT };
  }
  try {
    if (id) await prisma.subject.update({ where: { id }, data });
    else {
      const last = await prisma.subject.aggregate({ _max: { sortOrder: true } });
      await prisma.subject.create({ data: { ...data, sortOrder: (last._max.sortOrder ?? -1) + 1 } });
    }
  } catch {
    return { ok: false, error: `A subject with the code "${data.code}" already exists.` };
  }
  revalidatePath("/subjects");
  revalidatePath("/scheduler");
  queueWorkloadCheck("A subject was changed");
  return { ok: true };
}
