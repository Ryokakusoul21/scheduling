import "server-only";
import { prisma } from "@/lib/db/prisma";
import { can } from "./policy";
import { logBlocked } from "./department";
import { policyUserFromScope, type Scope } from "./scope";

export type SectionAccess = "ok" | "notFound" | "forbidden";

/**
 * Looks a section up through the caller's scope: outside the department or assigned programs it does not exist
 * for the caller ("notFound"); visible but not changeable is a readable refusal ("forbidden").
 */
export async function sectionAccess(scope: Scope, sectionId: string): Promise<SectionAccess> {
  const section = await prisma.section.findUnique({ where: { id: sectionId }, select: { departmentId: true, programId: true } });
  const resource = { type: "section" as const, id: sectionId, departmentId: section?.departmentId, programId: section?.programId };
  const user = policyUserFromScope(scope);
  if (!section || !can(user, "view", resource)) return "notFound";
  return can(user, "edit", resource) ? "ok" : "forbidden";
}

/** Writes the blocked attempt to the audit log and returns the message to show. */
export async function refuseSection(scope: Scope, access: Exclude<SectionAccess, "ok">, entity: string, entityId?: string | null) {
  await logBlocked(scope, access === "notFound" ? `reach a ${entity.toLowerCase()} outside the assigned programs` : `change a read-only ${entity.toLowerCase()}`, entity, entityId);
  return access === "notFound" ? `This ${entity.toLowerCase()} or section was not found.` : `You can view this ${entity.toLowerCase()} but not change it.`;
}
