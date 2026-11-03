import "server-only";
import { prisma } from "@/lib/db/prisma";

/**
 * Urgent and Critical overrides in the last `days` days (optionally one department, as booker or room owner):
 * counts per department and room, the classes displaced most often, and the average time until every affected
 * faculty member responded.
 */
export async function overrideReport(departmentId: string | null, days = 90) {
  const since = new Date(Date.now() - days * 86_400_000);
  const rows = await prisma.roomBooking.findMany({
    where: {
      priority: { in: ["URGENT", "CRITICAL"] }, status: { notIn: ["REJECTED", "AWAITING_APPROVAL"] }, createdAt: { gte: since },
      ...(departmentId ? { OR: [{ departmentId }, { room: { departmentId } }] } : {}),
    },
    select: {
      createdAt: true, departmentId: true,
      room: { select: { roomName: true } },
      acknowledgements: { select: { respondedAt: true } },
      batch: { select: { adjustments: { select: { schedule: { select: { subject: { select: { code: true } }, section: { select: { name: true } } } } } } } },
    },
  });
  const names = new Map((await prisma.department.findMany({ select: { id: true, name: true } })).map((d) => [d.id, d.name]));
  const tally = (keys: string[]) => [...keys.reduce((m, k) => m.set(k, (m.get(k) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1]).map(([label, count]) => ({ label, count }));

  const resolved = rows.filter((r) => r.acknowledgements.length && r.acknowledgements.every((a) => a.respondedAt));
  const hours = resolved.map((r) => (Math.max(...r.acknowledgements.map((a) => a.respondedAt!.getTime())) - r.createdAt.getTime()) / 3_600_000);
  return {
    days,
    total: rows.length,
    classesMoved: rows.reduce((n, r) => n + (r.batch?.adjustments.length ?? 0), 0),
    byDepartment: tally(rows.map((r) => names.get(r.departmentId ?? "") ?? "No department")),
    byRoom: tally(rows.map((r) => r.room.roomName)),
    mostDisplaced: tally(rows.flatMap((r) => r.batch?.adjustments.map((a) => `${a.schedule.subject.code} ${a.schedule.section.name}`) ?? [])).slice(0, 10),
    averageResolutionHours: hours.length ? Math.round((hours.reduce((a, b) => a + b, 0) / hours.length) * 10) / 10 : null,
    unresolved: rows.length - resolved.length,
  };
}
