"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

const STAFF = ["SUPER_ADMIN", "ADMINISTRATOR", "REGISTRAR"] as const;

const schema = z.object({
  roomNumber: z.string().min(1),
  roomName: z.string().min(1),
  building: z.string().optional(),
  capacity: z.coerce.number().int().min(1),
  roomType: z.enum(["LECTURE_ROOM", "COMPUTER_LABORATORY", "SCIENCE_LABORATORY", "CONFERENCE_ROOM", "OTHER"]),
  status: z.enum(["AVAILABLE", "UNDER_MAINTENANCE", "UNAVAILABLE"]),
  equipment: z.string().optional(),
});

function clean(d: z.infer<typeof schema>) {
  return {
    roomNumber: d.roomNumber,
    roomName: d.roomName,
    building: d.building || null,
    capacity: d.capacity,
    roomType: d.roomType,
    status: d.status,
    equipment: d.equipment ? d.equipment.split(",").map((e) => e.trim()).filter(Boolean) : [],
  };
}

export async function createRoomAction(formData: FormData) {
  await requireRole(...STAFF);
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  try {
    const created = await prisma.room.create({ data: clean(parsed.data) });
    await prisma.roomAvailability.createMany({
      data: (["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"] as const).map((d) => ({
        roomId: created.id,
        dayOfWeek: d,
        startMin: 7 * 60,
        endMin: 19 * 60,
      })),
    });
    revalidatePath("/rooms");
    return { ok: true };
  } catch {
    return { ok: false, error: "A room with that number already exists." };
  }
}

export async function updateRoomAction(id: string, formData: FormData) {
  await requireRole(...STAFF);
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  await prisma.room.update({ where: { id }, data: clean(parsed.data) });
  revalidatePath("/rooms");
  return { ok: true };
}

export async function deleteRoomAction(id: string) {
  await requireRole(...STAFF);
  const scheduleCount = await prisma.schedule.count({ where: { roomId: id } });
  if (scheduleCount > 0) return { ok: false, error: "This room has existing schedule assignments." };
  await prisma.room.delete({ where: { id } });
  revalidatePath("/rooms");
  return { ok: true };
}
