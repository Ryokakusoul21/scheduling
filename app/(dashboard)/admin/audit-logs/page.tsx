import { prisma } from "@/lib/db/prisma";
import { requireScope } from "@/lib/permissions/scope";
import { PRIVATE_APPROVAL_AUDIT } from "@/lib/permissions/notifications";
import { auditQuery, sanitizeAuditValue } from "@/lib/admin/audit";
import { PageHeader } from "@/components/ux/states";
import { AuditWorkspace } from "./audit-workspace";

export const metadata = { title: "Audit Logs · GRANBY COLLEGES OF SCIENCE AND TECHNOLOGY" };

export default async function AuditLogsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireScope("SUPER_ADMINISTRATOR");
  const { filters, where, requestedPage, error } = auditQuery(await searchParams);
  const now = new Date();
  const today = new Date(`${now.toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" })}T00:00:00+08:00`);
  const [total, blocked, todayCount, actorsInResults, actors, entities] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.count({ where: { AND: [where, { action: { startsWith: "Blocked:" } }] } }),
    prisma.auditLog.count({ where: { AND: [where, { createdAt: { gte: today } }] } }),
    prisma.auditLog.groupBy({ by: ["userId"], where: { AND: [where, { userId: { not: null } }] } }),
    prisma.user.findMany({ where: { auditLogs: { some: PRIVATE_APPROVAL_AUDIT } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.auditLog.groupBy({ by: ["entity"], where: PRIVATE_APPROVAL_AUDIT, orderBy: { entity: "asc" } }),
  ]);
  const pageSize = 25;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, pages);
  const logs = await prisma.auditLog.findMany({
    where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: pageSize, skip: (page - 1) * pageSize,
    select: { id: true, userId: true, user: { select: { name: true, email: true } }, action: true, entity: true, entityId: true, role: true, reason: true, ipAddress: true, oldValue: true, newValue: true, createdAt: true },
  });
  return <div className="space-y-6">
    <PageHeader title="Audit Logs" description="Recorded system activity and blocked attempts." />
    <AuditWorkspace filters={filters} error={error} actors={actors.map((actor) => ({ value: actor.id, label: actor.name }))} entities={entities.map((entry) => ({ value: entry.entity, label: entry.entity }))}
      stats={{ total, blocked, today: todayCount, actors: actorsInResults.length }} page={page} pages={pages} pageSize={pageSize}
      rows={logs.map((log) => ({
        id: log.id, userId: log.userId, actor: log.user?.name ?? (log.userId ? "Unavailable account" : "System"), email: log.user?.email ?? null,
        action: log.action, entity: log.entity, entityId: log.entityId, role: log.role, reason: log.reason, ipAddress: log.ipAddress,
        createdAt: log.createdAt.toISOString(), oldValue: sanitizeAuditValue(log.oldValue), newValue: sanitizeAuditValue(log.newValue),
      }))} />
  </div>;
}
