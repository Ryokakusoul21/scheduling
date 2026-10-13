"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { queueWorkloadCheck } from "@/lib/workload/auto";
import { getScope } from "@/lib/permissions/scope";
import { loadPlan } from "@/lib/occupancy/load";
import { applyPlan, planRoomBooking, planRoomBookingWith, undoBatch, type PlanItem } from "@/lib/occupancy/adjust";
import { notifyUsers } from "@/lib/notify";

type Result<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

const ROOM_TYPES = ["LECTURE_ROOM", "COMPUTER_LABORATORY", "SCIENCE_LABORATORY", "CONFERENCE_ROOM", "OTHER"] as const;

const slotSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date"),
    startMin: z.number().int().min(0).max(24 * 60),
    endMin: z.number().int().min(0).max(24 * 60),
    attendees: z.number().int().min(1, "Enter the number of attendees").max(1000),
    purpose: z.string().trim().min(3, "Describe the purpose").max(200),
  })
  .refine((d) => d.endMin > d.startMin, { message: "End time must be after start time" });

const searchSchema = slotSchema.and(z.object({ roomType: z.enum(ROOM_TYPES).optional() }));
const bookSchema = slotSchema.and(z.object({ roomId: z.string().min(1) }));

function today() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
}

export interface RoomOption {
  roomId: string;
  name: string;
  location: string;
  capacity: number;
  roomType: string;
  status: "FREE" | "MOVES" | "BLOCKED";
  items: PlanItem[];
  blockers: string[];
}

/** Rates every room that fits the request: free now, free after moving classes, or blocked. */
export async function findRoomsAction(input: z.infer<typeof searchSchema>): Promise<Result<RoomOption[]>> {
  await getScope();
  const parsed = searchSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the booking details." };
  const d = parsed.data;
  if (d.date < today()) return { ok: false, error: "Bookings must be for today or a later date." };

  const [loaded, rooms] = await Promise.all([
    loadPlan(d.date, d.date),
    prisma.room.findMany({
      where: { capacity: { gte: d.attendees }, status: "AVAILABLE", ...(d.roomType ? { roomType: d.roomType } : {}) },
      include: { floor: { select: { name: true, building: { select: { name: true } } } } },
      orderBy: [{ capacity: "asc" }, { roomName: "asc" }],
    }),
  ]);

  const options = rooms.map((r) => {
    const plan = planRoomBookingWith(loaded, { ...d, roomId: r.id });
    const status: RoomOption["status"] = plan.blockers.length ? "BLOCKED" : plan.items.length ? "MOVES" : "FREE";
    return {
      roomId: r.id,
      name: r.roomName,
      location: r.floor ? `${r.floor.building.name}, ${r.floor.name}` : "No building",
      capacity: r.capacity,
      roomType: r.roomType,
      status,
      items: plan.items,
      blockers: plan.blockers,
    };
  });
  const rank = { FREE: 0, MOVES: 1, BLOCKED: 2 };
  return { ok: true, data: options.sort((a, b) => rank[a.status] - rank[b.status] || a.items.length - b.items.length) };
}

/** Books the room; conflicting classes are rescheduled automatically and their faculty notified. */
export async function bookRoomAction(input: z.infer<typeof bookSchema>): Promise<Result<{ bookingId: string; items: PlanItem[] }>> {
  const scope = await getScope();
  const parsed = bookSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the booking details." };
  const d = parsed.data;
  if (d.date < today()) return { ok: false, error: "Bookings must be for today or a later date." };
  const room = await prisma.room.findUnique({ where: { id: d.roomId }, select: { capacity: true, roomName: true } });
  if (!room) return { ok: false, error: "The room no longer exists." };
  if (room.capacity < d.attendees) return { ok: false, error: `${room.roomName} seats only ${room.capacity}.` };

  // Re-plan at booking time so the result reflects any change since the preview.
  const plan = await planRoomBooking(d);
  if (plan.blockers.length) return { ok: false, error: plan.blockers.join(" ") };

  const batchId = plan.items.length
    ? await applyPlan(plan, "ROOM_BOOKING", `${room.roomName} booked on ${d.date} for "${d.purpose}"`, scope.userId)
    : null;
  const booking = await prisma.roomBooking.create({
    data: {
      roomId: d.roomId, bookedById: scope.userId, purpose: d.purpose, date: new Date(`${d.date}T00:00:00Z`),
      startMin: d.startMin, endMin: d.endMin, attendees: d.attendees, batchId,
    },
  });
  await prisma.auditLog.create({
    data: {
      userId: scope.userId, action: `Booked ${room.roomName}${plan.items.length ? ` and moved ${plan.items.length} class meeting(s)` : ""}`,
      entity: "RoomBooking", entityId: booking.id, newValue: { ...d, moved: plan.items.length },
    },
  });
  revalidatePath("/bookings");
  revalidatePath("/calendar");
  queueWorkloadCheck("A room was booked");
  return { ok: true, data: { bookingId: booking.id, items: plan.items } };
}

/**
 * Cancels a booking and undoes the classes it moved. When `keepMoves` is set the booking is
 * cancelled but moved classes stay put (used when their original slots were taken since).
 */
export async function cancelBookingAction(id: string, keepMoves = false): Promise<Result> {
  const scope = await getScope();
  const booking = await prisma.roomBooking.findUnique({ where: { id }, include: { room: { select: { roomName: true } } } });
  if (!booking || booking.status === "CANCELLED") return { ok: false, error: "This booking is already cancelled." };
  if (!scope.isAdmin && booking.bookedById !== scope.userId) return { ok: false, error: "Only the person who booked the room or an Administrator can cancel it." };

  if (booking.batchId && !keepMoves) {
    const problem = await undoBatch(booking.batchId, [booking.id]);
    if (problem) return { ok: false, error: problem };
  }
  await prisma.roomBooking.update({ where: { id }, data: { status: "CANCELLED" } });
  await prisma.auditLog.create({
    data: { userId: scope.userId, action: `Cancelled booking of ${booking.room.roomName}${booking.batchId && !keepMoves ? " and restored moved classes" : ""}`, entity: "RoomBooking", entityId: id },
  });
  if (booking.bookedById !== scope.userId) {
    await notifyUsers([booking.bookedById], { title: "Room booking cancelled", message: `Your booking of ${booking.room.roomName} for "${booking.purpose}" was cancelled by an Administrator.`, link: "/bookings" });
  }
  revalidatePath("/bookings");
  revalidatePath("/calendar");
  queueWorkloadCheck("A room booking was cancelled");
  return { ok: true, data: undefined };
}
