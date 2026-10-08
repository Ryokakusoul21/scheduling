"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { STAFF_ROLES } from "@/lib/permissions/roles";

type Result = { ok: boolean; error?: string };

function done(): Result {
  revalidatePath("/rooms");
  revalidatePath("/scheduler");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Buildings
// ---------------------------------------------------------------------------

const buildingSchema = z.object({
  name: z.string().trim().min(1, "Building name is required").max(80),
  code: z.string().trim().max(10).optional(),
  description: z.string().max(300).optional(),
});

export async function saveBuildingAction(id: string | null, formData: FormData): Promise<Result> {
  await requireRole(...STAFF_ROLES);
  const parsed = buildingSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const data = { name: parsed.data.name, code: parsed.data.code || null, description: parsed.data.description || null };
  try {
    if (id) await prisma.building.update({ where: { id }, data });
    else {
      const last = await prisma.building.aggregate({ _max: { sortOrder: true } });
      // New buildings start with a ground floor so rooms can be added right away.
      await prisma.building.create({
        data: { ...data, sortOrder: (last._max.sortOrder ?? -1) + 1, floors: { create: { name: "Ground Floor", number: 1 } } },
      });
    }
  } catch {
    return { ok: false, error: `A building named "${data.name}" already exists.` };
  }
  return done();
}

export async function deleteBuildingAction(id: string): Promise<Result> {
  await requireRole(...STAFF_ROLES);
  const rooms = await prisma.room.count({ where: { floor: { buildingId: id } } });
  if (rooms > 0) return { ok: false, error: `This building still has ${rooms} room(s). Move or delete them first.` };
  await prisma.building.delete({ where: { id } });
  return done();
}

// ---------------------------------------------------------------------------
// Floors
// ---------------------------------------------------------------------------

const floorSchema = z.object({
  buildingId: z.string().min(1),
  name: z.string().trim().min(1, "Floor name is required").max(40),
  number: z.coerce.number().int().min(-5).max(100),
});

export async function saveFloorAction(id: string | null, formData: FormData): Promise<Result> {
  await requireRole(...STAFF_ROLES);
  const parsed = floorSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  try {
    if (id) await prisma.floor.update({ where: { id }, data: { name: parsed.data.name, number: parsed.data.number } });
    else await prisma.floor.create({ data: parsed.data });
  } catch {
    return { ok: false, error: `This building already has a floor named "${parsed.data.name}".` };
  }
  return done();
}

export async function deleteFloorAction(id: string): Promise<Result> {
  await requireRole(...STAFF_ROLES);
  const rooms = await prisma.room.count({ where: { floorId: id } });
  if (rooms > 0) return { ok: false, error: `This floor still has ${rooms} room(s). Move or delete them first.` };
  await prisma.floor.delete({ where: { id } });
  return done();
}

// ---------------------------------------------------------------------------
// Rooms
// ---------------------------------------------------------------------------

const roomSchema = z.object({
  floorId: z.string().min(1, "Choose a floor"),
  roomNumber: z.string().trim().min(1, "Room number is required").max(20),
  roomName: z.string().trim().min(1, "Room name is required").max(80),
  capacity: z.coerce.number().int().min(1, "Capacity must be at least 1").max(1000),
  roomType: z.enum(["LECTURE_ROOM", "COMPUTER_LABORATORY", "SCIENCE_LABORATORY", "CONFERENCE_ROOM", "OTHER"]),
  status: z.enum(["AVAILABLE", "UNDER_MAINTENANCE", "UNAVAILABLE"]),
  equipment: z.string().max(500).optional(),
});

export async function saveRoomAction(id: string | null, formData: FormData): Promise<Result> {
  await requireRole(...STAFF_ROLES);
  const parsed = roomSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const d = parsed.data;
  const data = {
    ...d,
    equipment: d.equipment ? d.equipment.split(",").map((e) => e.trim()).filter(Boolean) : [],
  };
  try {
    if (id) await prisma.room.update({ where: { id }, data });
    else {
      const last = await prisma.room.aggregate({ where: { floorId: d.floorId }, _max: { sortOrder: true } });
      await prisma.room.create({
        data: {
          ...data,
          sortOrder: (last._max.sortOrder ?? -1) + 1,
          availability: {
            create: (["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"] as const).map((day) => ({
              dayOfWeek: day,
              startMin: 7 * 60,
              endMin: 19 * 60,
            })),
          },
        },
      });
    }
  } catch {
    return { ok: false, error: `Room number "${d.roomNumber}" is already used.` };
  }
  return done();
}

export async function deleteRoomAction(id: string): Promise<Result> {
  await requireRole(...STAFF_ROLES);
  const classes = await prisma.schedule.count({ where: { roomId: id } });
  if (classes > 0) return { ok: false, error: `This room has ${classes} scheduled class(es). Move them in the Scheduler first.` };
  await prisma.room.delete({ where: { id } });
  return done();
}
