import type { Prisma } from "@prisma/client";

/** Also hides historical notifications sent before department approvals became private. */
export function notificationVisibility(role: string): Prisma.NotificationWhereInput {
  if (!["SUPER_ADMINISTRATOR", "REGISTRAR"].includes(role)) return {};
  return { OR: [{ link: null }, { NOT: { OR: [
    { link: { startsWith: "/requests" } },
    { link: { startsWith: "/workload" } },
  ] } }] };
}

export const PRIVATE_APPROVAL_AUDIT: Prisma.AuditLogWhereInput = {
  entity: { notIn: ["ScheduleRequest", "WorkloadProposal", "WorkloadFix"] },
  NOT: { OR: [
    { action: { startsWith: "Applied faculty record change" } },
    { action: { startsWith: "Applied approved cross-department request" } },
  ] },
};
