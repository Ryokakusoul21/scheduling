"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

const schema = z.object({
  userId: z.string().min(1),
  programId: z.string().min(1),
  isActing: z.boolean(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().nullable(),
});
type Input = z.input<typeof schema>;

/** Departments a Head of Department belongs to, read from stored records only. */
async function homeDepartments(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, faculty: { select: { departmentId: true } }, departmentAssignments: { select: { departmentId: true } } },
  });
  if (user?.role !== "HEAD_OF_DEPARTMENT") return null;
  return [...new Set([user.faculty?.departmentId, ...user.departmentAssignments.map((a) => a.departmentId)].filter((id): id is string => !!id))];
}

/** Checks the input and that the program belongs to the head's own department; the department is never taken from the request. */
async function validate(input: Input) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the assignment details." };
  const d = parsed.data;
  if (d.endDate && d.endDate < d.startDate) return { error: "The end date must be on or after the start date." };
  const [departments, program] = await Promise.all([
    homeDepartments(d.userId),
    prisma.program.findUnique({ where: { id: d.programId }, select: { departmentId: true, code: true } }),
  ]);
  if (!departments) return { error: "Only Head of Department accounts can be assigned to programs." };
  if (!program?.departmentId || !departments.includes(program.departmentId)) return { error: "A Head of Department can only be assigned to programs of their own department." };
  return { data: d, program };
}

export async function assignProgramAction(input: Input) {
  const admin = await requireRole("SUPER_ADMINISTRATOR");
  const v = await validate(input);
  if (!v.data) return { ok: false, error: v.error };
  const { userId, programId, isActing, startDate, endDate } = v.data;
  const row = await prisma.headProgramAssignment.upsert({
    where: { userId_programId: { userId, programId } },
    create: { userId, programId, isActing, startDate, endDate },
    update: { isActing, startDate, endDate },
  });
  await prisma.auditLog.create({
    data: { userId: admin.id, role: admin.role, action: "Assigned Head of Department to program", entity: "HeadProgramAssignment", entityId: row.id, newValue: { userId, program: v.program.code, isActing, startDate, endDate } },
  });
  revalidatePath("/admin/users");
  return { ok: true };
}

export async function updateProgramAssignmentAction(id: string, input: Omit<Input, "userId" | "programId">) {
  const admin = await requireRole("SUPER_ADMINISTRATOR");
  const old = await prisma.headProgramAssignment.findUnique({ where: { id } });
  if (!old) return { ok: false, error: "This assignment no longer exists." };
  const v = await validate({ ...input, userId: old.userId, programId: old.programId });
  if (!v.data) return { ok: false, error: v.error };
  await prisma.headProgramAssignment.update({ where: { id }, data: { isActing: v.data.isActing, startDate: v.data.startDate, endDate: v.data.endDate } });
  await prisma.auditLog.create({
    data: {
      userId: admin.id, role: admin.role, action: "Updated Head of Department program assignment", entity: "HeadProgramAssignment", entityId: id,
      oldValue: { isActing: old.isActing, startDate: old.startDate, endDate: old.endDate }, newValue: { isActing: v.data.isActing, startDate: v.data.startDate, endDate: v.data.endDate },
    },
  });
  revalidatePath("/admin/users");
  return { ok: true };
}

export async function removeProgramAssignmentAction(id: string) {
  const admin = await requireRole("SUPER_ADMINISTRATOR");
  const old = await prisma.headProgramAssignment.findUnique({ where: { id }, include: { program: { select: { code: true } } } });
  if (!old) return { ok: false, error: "This assignment no longer exists." };
  await prisma.headProgramAssignment.delete({ where: { id } });
  await prisma.auditLog.create({
    data: { userId: admin.id, role: admin.role, action: "Removed Head of Department program assignment", entity: "HeadProgramAssignment", entityId: id, oldValue: { userId: old.userId, program: old.program.code } },
  });
  revalidatePath("/admin/users");
  return { ok: true };
}
