"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { STAFF_ROLES } from "@/lib/permissions/roles";
import { canManageDepartment, OUTSIDE_DEPARTMENT, requireScope, type Scope } from "@/lib/permissions/scope";
import { CONSTRAINT_KINDS, LOCKED_KINDS, PARAM_SCHEMAS, type ConstraintKind } from "@/lib/scheduler/constraints";

type Result = { ok: boolean; error?: string };

const schema = z.object({
  kind: z.enum(CONSTRAINT_KINDS as [ConstraintKind, ...ConstraintKind[]]),
  name: z.string().trim().min(2, "Enter a name").max(120),
  params: z.unknown(),
  departmentId: z.string().nullable(),
  enabled: z.boolean(),
});

export type ConstraintInput = z.infer<typeof schema>;

/** Administrator manages every constraint; a Head of Department only those of their own department. */
async function allowed(scope: Scope, id: string) {
  const row = await prisma.schedulingConstraint.findUnique({ where: { id }, select: { departmentId: true, kind: true } });
  return row && canManageDepartment(scope, row.departmentId) ? row : null;
}

function revalidate() {
  revalidatePath("/constraints");
  revalidatePath("/scheduler");
}

export async function saveConstraintAction(id: string | null, input: ConstraintInput): Promise<Result> {
  const scope = await requireScope(...STAFF_ROLES);
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const params = PARAM_SCHEMAS[parsed.data.kind].safeParse(parsed.data.params);
  if (!params.success) return { ok: false, error: params.error.issues[0]?.message ?? "Check the constraint settings." };

  const departmentId = scope.isAdmin ? parsed.data.departmentId || null : scope.departmentId;
  if (!canManageDepartment(scope, departmentId)) return { ok: false, error: OUTSIDE_DEPARTMENT };
  const locked = LOCKED_KINDS.includes(parsed.data.kind);
  const data = {
    kind: parsed.data.kind,
    name: parsed.data.name,
    params: params.data as Prisma.InputJsonValue,
    departmentId,
    enabled: locked || parsed.data.enabled,
  };

  if (id) {
    const existing = await allowed(scope, id);
    if (!existing) return { ok: false, error: OUTSIDE_DEPARTMENT };
    if (LOCKED_KINDS.includes(existing.kind) && existing.kind !== data.kind) return { ok: false, error: "This constraint is always enforced and cannot change type." };
    await prisma.schedulingConstraint.update({ where: { id }, data });
  } else {
    if (locked) return { ok: false, error: "Double-booking is already prevented at all times." };
    await prisma.schedulingConstraint.create({ data: { ...data, createdById: scope.userId } });
  }
  await prisma.auditLog.create({
    data: { userId: scope.userId, action: id ? "Edited scheduling constraint" : "Created scheduling constraint", entity: "SchedulingConstraint", entityId: id, newValue: data },
  });
  revalidate();
  return { ok: true };
}

export async function toggleConstraintAction(id: string, enabled: boolean): Promise<Result> {
  const scope = await requireScope(...STAFF_ROLES);
  const existing = await allowed(scope, id);
  if (!existing) return { ok: false, error: OUTSIDE_DEPARTMENT };
  if (LOCKED_KINDS.includes(existing.kind)) return { ok: false, error: "Double-booking prevention cannot be turned off." };
  await prisma.schedulingConstraint.update({ where: { id }, data: { enabled } });
  await prisma.auditLog.create({
    data: { userId: scope.userId, action: `${enabled ? "Enabled" : "Disabled"} scheduling constraint`, entity: "SchedulingConstraint", entityId: id },
  });
  revalidate();
  return { ok: true };
}

export async function deleteConstraintAction(id: string): Promise<Result> {
  const scope = await requireScope(...STAFF_ROLES);
  const existing = await allowed(scope, id);
  if (!existing) return { ok: false, error: OUTSIDE_DEPARTMENT };
  if (LOCKED_KINDS.includes(existing.kind)) return { ok: false, error: "Double-booking prevention cannot be deleted." };
  await prisma.schedulingConstraint.delete({ where: { id } });
  await prisma.auditLog.create({ data: { userId: scope.userId, action: "Deleted scheduling constraint", entity: "SchedulingConstraint", entityId: id } });
  revalidate();
  return { ok: true };
}
