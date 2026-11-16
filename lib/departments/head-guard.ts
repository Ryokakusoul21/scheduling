import "server-only";
import type { Prisma } from "@prisma/client";
import { conflictingDepartmentHead, DepartmentHeadConflictError } from "./heads";

/** Every account, faculty-link, and department-assignment writer uses the same transaction lock. */
export async function lockDepartmentHeads(tx: Prisma.TransactionClient) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('department-head-authority'))`;
}

export async function assertSingleDepartmentHead(tx: Prisma.TransactionClient, userId: string) {
  const heads = await tx.user.findMany({
    where: { role: "HEAD_OF_DEPARTMENT", status: "ACTIVE", archivedAt: null },
    select: {
      id: true, name: true,
      faculty: { select: { departmentId: true } },
      departmentAssignments: { select: { departmentId: true, startsAt: true, endsAt: true } },
    },
  });
  const conflict = conflictingDepartmentHead(heads, userId);
  if (conflict) throw new DepartmentHeadConflictError(conflict.name);
}
