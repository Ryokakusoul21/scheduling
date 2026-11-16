import { roomLabel } from "@/lib/rooms/label";
import "server-only";
import type { Scope } from "@/lib/permissions/scope";
import { prisma } from "@/lib/db/prisma";
import { departmentWhere } from "@/lib/permissions/department";
import { loadPlan } from "@/lib/occupancy/load";
import { addDays } from "@/lib/occupancy/engine";
import { isOverride } from "./plan";
import { submittedTimetableFilter } from "@/lib/scheduler/visibility";

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
      orderBy: [{ sortOrder: "asc" }, { roomNumber: "asc" }],
      select: { id: true, roomNumber: true, roomName: true, capacity: true, status: true, floor: { select: { building: { select: { name: true } } } } },
    }),
  ]);
  const ids = new Set(rooms.map((r) => r.id));
  // Keep every occupied slot for collision checks, but hide unsubmitted timetable details.
  const visible = scope.isAdmin ? new Set((await Promise.all([
    prisma.schedule.findMany({ where: { id: { in: plan.ctx.occupants.filter((o) => o.kind === "CLASS").map((o) => o.refId) }, ...submittedTimetableFilter(scope.role) }, select: { id: true } }),
    prisma.examination.findMany({ where: { id: { in: plan.ctx.occupants.filter((o) => o.kind === "EXAMINATION").map((o) => o.refId) }, ...submittedTimetableFilter(scope.role) }, select: { id: true } }),
  ])).flat().map((row) => row.id)) : null;
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
      label: visible && o.kind !== "BOOKING" && !visible.has(o.refId) ? "Unavailable" : o.kind === "CLASS" && !own(o.refId) ? "Class of another department" : o.label,
      urgent: o.kind === "BOOKING" && isOverride(priority.get(o.refId) ?? "REGULAR"),
    }));
  return {
    rooms: rooms.map((r) => ({ id: r.id, name: roomLabel(r), capacity: r.capacity, building: r.floor?.building.name ?? "", closed: r.status !== "AVAILABLE" })),
    blocks,
  };
}
