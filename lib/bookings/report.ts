import { roomLabel } from "@/lib/rooms/label";
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { can, scopeQuery } from "@/lib/permissions/policy";
import { policyUserFromScope, type Scope } from "@/lib/permissions/scope";
import type { OverrideEntry } from "./override-metrics";

/** Executed urgent overrides, with class details constrained before they leave the database. */
export async function overrideReport(scope: Scope, departmentId: string | null) {
  const user = policyUserFromScope(scope);
  if (!can(user, "view", { type: "roomBooking", departmentId })) return null;
  if (scope.role !== "REGISTRAR" && scope.role !== "HEAD_OF_DEPARTMENT") return null;
  const generatedAt = new Date();
  const since = new Date(generatedAt.getTime() - 180 * 86_400_000);
  const head = scope.role === "HEAD_OF_DEPARTMENT";
  const rows = await prisma.roomBooking.findMany({
    where: {
      priority: { in: ["URGENT", "CRITICAL"] },
      AND: [
        { OR: [{ status: { in: ["CONFIRMED", "COMPLETED", "NO_SHOW"] } }, { status: "CANCELLED", batchId: { not: null } }] },
        { OR: [{ batch: { createdAt: { gte: since } } }, { batchId: null, createdAt: { gte: since } }] },
        ...(departmentId ? [{ OR: [{ departmentId }, { room: { departmentId } }] }] : []),
      ],
    },
    select: {
      id: true, purpose: true, priority: true, status: true, date: true, createdAt: true, departmentId: true, roomId: true,
      room: { select: { roomNumber: true, roomName: true } },
      acknowledgements: { select: { facultyId: true, status: true, respondedAt: true } },
      batch: { select: {
        createdAt: true, undoneAt: true,
        adjustments: {
          where: { kind: { not: "MAKE_UP" }, ...(head ? { schedule: scopeQuery(user, "schedule") } : {}) },
          select: { scheduleId: true, date: true, kind: true, schedule: { select: { facultyId: true, component: true, subject: { select: { code: true } }, section: { select: { name: true } } } } },
        },
      } },
    },
    orderBy: { createdAt: "desc" },
  });
  const departmentIds = [...new Set([...rows.flatMap((row) => row.departmentId ? [row.departmentId] : []), ...(departmentId ? [departmentId] : [])])];
  const names = new Map((await prisma.department.findMany({ where: { id: { in: departmentIds } }, select: { id: true, name: true } })).map((department) => [department.id, department.name]));
  const entries: OverrideEntry[] = rows.map((row) => {
    const facultyIds = new Set(row.batch?.adjustments.map((item) => item.schedule.facultyId));
    return {
      id: row.id, purpose: row.purpose, roomId: row.roomId, room: roomLabel(row.room),
      departmentId: row.departmentId, department: names.get(row.departmentId ?? "") ?? "No requesting department",
      priority: row.priority, occurredAt: (row.batch?.createdAt ?? row.createdAt).toISOString(), bookingDate: row.date.toISOString().slice(0, 10),
      restored: !!row.batch?.undoneAt || row.status === "CANCELLED",
      acknowledgements: row.acknowledgements.filter((ack) => !head || facultyIds.has(ack.facultyId)).map((ack) => ({ status: ack.status, respondedAt: ack.respondedAt?.toISOString() ?? null })),
      adjustments: row.batch?.adjustments.map((item) => ({ scheduleId: item.scheduleId, date: item.date.toISOString().slice(0, 10), kind: item.kind, label: `${item.schedule.subject.code} ${item.schedule.section.name} · ${item.schedule.component === "LABORATORY" ? "Lab" : "Lecture"}` })) ?? [],
    };
  });
  return {
    entries, generatedAt: generatedAt.toISOString(),
    scopeName: departmentId ? names.get(departmentId) ?? "Selected department" : "All departments",
    scopeNote: head ? "Class impact and faculty responses cover only the department and programs you handle." : "Covers executed Urgent and Critical bookings; pending and rejected requests are excluded.",
  };
}

export type OverrideReportData = NonNullable<Awaited<ReturnType<typeof overrideReport>>>;
