import "server-only";
import type { Scope } from "@/lib/permissions/scope";
import { prisma } from "@/lib/db/prisma";
import { departmentWhere } from "@/lib/permissions/department";
import { loadPlan } from "@/lib/occupancy/load";
import { addDays } from "@/lib/occupancy/engine";
import { isOverride } from "./plan";

export interface AvailabilityBlock {
  roomId: string;
  date: string;
  startMin: number;
  endMin: number;
  kind: "CLASS" | "EXAMINATION" | "BOOKING";
  label: string;
  urgent: boolean;
}

/** Occupancy of the rooms the viewer may book across `days` days, for the availability grid. */
export async function roomAvailability(scope: Scope, from: string, days: number) {
  const to = addDays(from, days - 1);
  const [plan, rooms] = await Promise.all([
    loadPlan(from, to),
    prisma.room.findMany({
      where: { archivedAt: null, ...departmentWhere.room(scope) },
      orderBy: [{ sortOrder: "asc" }, { roomName: "asc" }],
      select: { id: true, roomName: true, capacity: true, status: true, floor: { select: { building: { select: { name: true } } } } },
    }),
  ]);
  const ids = new Set(rooms.map((r) => r.id));
  const priority = new Map(plan.bookings.map((b) => [b.id, b.priority]));
  const own = (scheduleId: string) => {
    const d = plan.classInfo.get(scheduleId)?.departmentId;
    return scope.isAdmin || (!!d && scope.departmentIds.includes(d));
  };
  const blocks: AvailabilityBlock[] = plan.ctx.occupants
    .filter((o) => o.roomId && ids.has(o.roomId) && o.date >= from && o.date <= to)
    .map((o) => ({
      roomId: o.roomId!, date: o.date, startMin: o.startMin, endMin: o.endMin, kind: o.kind,
      // Other departments' classes stay anonymous.
      label: o.kind === "CLASS" && !own(o.refId) ? "Class of another department" : o.label,
      urgent: o.kind === "BOOKING" && isOverride(priority.get(o.refId) ?? "REGULAR"),
    }));
  return {
    rooms: rooms.map((r) => ({ id: r.id, name: r.roomName, capacity: r.capacity, building: r.floor?.building.name ?? "", closed: r.status !== "AVAILABLE" })),
    blocks,
  };
}
