"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireScope } from "@/lib/permissions/scope";

type Result = { ok: true } | { ok: false; error: string };

const departmentSchema = z.object({
  code: z.string().trim().min(1, "Enter a department code.").max(20).regex(/^[A-Za-z0-9_-]+$/, "Use letters, numbers, hyphens, or underscores for the code."),
  name: z.string().trim().min(2, "Enter a department name.").max(150),
});

function refreshDepartments() {
  revalidatePath("/admin/departments");
  revalidatePath("/dashboard");
  revalidatePath("/analytics");
  revalidatePath("/programs");
  revalidatePath("/", "layout");
}

export async function saveDepartmentAction(id: string | null, formData: FormData): Promise<Result> {
  const scope = await requireScope("REGISTRAR", "SUPER_ADMINISTRATOR");
  const parsed = departmentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the department details." };
  const data = { code: parsed.data.code.toUpperCase(), name: parsed.data.name };
  const [current, codeConflict, nameConflict] = await Promise.all([
    id ? prisma.department.findUnique({ where: { id }, select: { id: true, code: true, name: true } }) : Promise.resolve(null),
    prisma.department.findFirst({ where: { code: data.code, ...(id ? { id: { not: id } } : {}) }, select: { id: true } }),
    prisma.department.findFirst({ where: { name: { equals: data.name, mode: "insensitive" }, ...(id ? { id: { not: id } } : {}) }, select: { id: true } }),
  ]);
  if (id && !current) return { ok: false, error: "This department no longer exists." };
  if (codeConflict) return { ok: false, error: "Another department already uses that code." };
  if (nameConflict) return { ok: false, error: "Another department already uses that name." };
  if (current?.code === data.code && current.name === data.name) return { ok: true };

  await prisma.$transaction(async (tx) => {
    const department = current
      ? await tx.department.update({ where: { id: current.id }, data })
      : await tx.department.create({ data });
    await tx.auditLog.create({
      data: {
        userId: scope.userId,
        role: scope.role,
        departmentId: department.id,
        action: current ? "Updated department details" : "Created department",
        entity: "Department",
        entityId: department.id,
        ...(current ? { oldValue: { code: current.code, name: current.name } } : {}),
        newValue: data,
      },
    });
  });
  refreshDepartments();
  return { ok: true };
}

export async function assignDepartmentHeadAction(departmentId: string, userId: string): Promise<Result> {
  const scope = await requireScope("REGISTRAR", "SUPER_ADMINISTRATOR");
  const [department, user] = await Promise.all([
    prisma.department.findUnique({ where: { id: departmentId }, select: { id: true, name: true } }),
    prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, role: true, status: true, archivedAt: true } }),
  ]);
  if (!department) return { ok: false, error: "This department no longer exists." };
  if (!user || user.role !== "HEAD_OF_DEPARTMENT" || user.status !== "ACTIVE" || user.archivedAt) {
    return { ok: false, error: "Choose an active Head of Department account." };
  }

  await prisma.$transaction(async (tx) => {
    const previous = await tx.userDepartmentAssignment.findUnique({
      where: { userId_departmentId: { userId, departmentId } },
      select: { id: true, acting: true, startsAt: true, endsAt: true },
    });
    await tx.userDepartmentAssignment.upsert({
      where: { userId_departmentId: { userId, departmentId } },
      update: { acting: false, startsAt: null, endsAt: null },
      create: { userId, departmentId, acting: false },
    });
    await tx.auditLog.create({
      data: {
        userId: scope.userId,
        role: scope.role,
        departmentId,
        action: previous ? "Updated department Head of Department assignment" : "Assigned Head of Department to department",
        entity: "UserDepartmentAssignment",
        entityId: previous?.id,
        ...(previous ? { oldValue: { acting: previous.acting, startsAt: previous.startsAt?.toISOString() ?? null, endsAt: previous.endsAt?.toISOString() ?? null } } : {}),
        newValue: { userId, userName: user.name, departmentId, acting: false },
      },
    });
  });
  refreshDepartments();
  return { ok: true };
}

export async function removeDepartmentHeadAssignmentAction(departmentId: string, userId: string): Promise<Result> {
  const scope = await requireScope("REGISTRAR", "SUPER_ADMINISTRATOR");
  const [department, user, assignment] = await Promise.all([
    prisma.department.findUnique({ where: { id: departmentId }, select: { id: true } }),
    prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, role: true, status: true, archivedAt: true, faculty: { select: { departmentId: true } } } }),
    prisma.userDepartmentAssignment.findUnique({ where: { userId_departmentId: { userId, departmentId } } }),
  ]);
  if (!department || !user || !assignment) return { ok: false, error: "This department assignment no longer exists." };
  if (user.role !== "HEAD_OF_DEPARTMENT" || user.status !== "ACTIVE" || user.archivedAt) {
    return { ok: false, error: "Only an active Head of Department assignment can be removed here." };
  }
  const now = new Date();
  if ((assignment.startsAt && assignment.startsAt > now) || (assignment.endsAt && assignment.endsAt < now)) {
    return { ok: false, error: "Only a current department assignment can be removed here." };
  }
  if (user.faculty?.departmentId === departmentId) {
    return { ok: false, error: "This Head of Department is also linked to faculty in this department. Update the faculty link before removing the department assignment." };
  }

  await prisma.$transaction(async (tx) => {
    await tx.userDepartmentAssignment.delete({ where: { userId_departmentId: { userId, departmentId } } });
    await tx.auditLog.create({
      data: {
        userId: scope.userId,
        role: scope.role,
        departmentId,
        action: "Removed department Head of Department assignment",
        entity: "UserDepartmentAssignment",
        entityId: assignment.id,
        oldValue: { userId, userName: user.name, departmentId, acting: assignment.acting },
      },
    });
  });
  refreshDepartments();
  return { ok: true };
}
