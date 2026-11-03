import "server-only";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { can, scopeQuery, type PolicyAction, type PolicyResource, type PolicyResourceType } from "./policy";
import { policyUserFromScope, type Scope } from "./scope";

export function scopedWhere(scope: Scope, type: PolicyResourceType, where: Record<string, unknown> = {}) {
  return { AND: [scopeQuery(policyUserFromScope(scope), type), where] };
}

/** Use after loading a record through scopedWhere. Mutations must authorize the stored owner. */
export async function assertCan(scope: Scope, action: PolicyAction, resource: PolicyResource, message = "You do not have permission to change this record.") {
  if (can(policyUserFromScope(scope), action, resource)) return;
  await prisma.auditLog.create({
    data: {
      userId: scope.userId,
      role: scope.role,
      departmentId: scope.departmentId,
      action: `Blocked: ${action}`,
      entity: resource.type,
      entityId: resource.id ?? null,
      reason: message,
    },
  });
  throw new Error(message);
}

/** Outside-scope and missing identifiers deliberately share the same response. */
export function scopedRecordOrNotFound<T>(record: T | null | undefined): T {
  if (!record) notFound();
  return record;
}
