"use server";

import { z } from "zod";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { ADMIN_ROLES } from "@/lib/permissions/roles";
import { canManageDepartment, requireScope } from "@/lib/permissions/scope";
import { BUILDING_PURPOSES } from "@/lib/rooms/buildings";
import { UNASSIGNED } from "@/lib/rooms/rooms";

type Result = { ok: boolean; error?: string };

function done(): Result {
  revalidatePath("/rooms");
  revalidatePath("/rooms/[buildingId]", "page");
  revalidatePath("/scheduler");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Buildings
// ---------------------------------------------------------------------------

const minutes = z.preprocess((v) => (v === "" || v === undefined ? null : Number(v)), z.number().int().min(0).max(24 * 60).nullable());

const buildingSchema = z
  .object({
    name: z.string().trim().min(1, "Building name is required").max(80),
    code: z.string().trim().max(10).optional(),
    description: z.string().max(300).optional(),
    location: z.string().trim().max(120).optional(),
    purpose: z.enum(BUILDING_PURPOSES),
    openingMin: minutes,
    closingMin: minutes,
  })
  .refine((d) => d.openingMin === null || d.closingMin === null || d.closingMin > d.openingMin, { message: "Closing time must be after opening time." });

export async function saveBuildingAction(id: string | null, formData: FormData): Promise<Result> {
  await requireRole(...ADMIN_ROLES);
  const parsed = buildingSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const d = parsed.data;
  const data = { ...d, code: d.code || null, description: d.description || null, location: d.location || null };
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

const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
/** The browser resizes photos first, so anything larger than this is not one of ours. */
const MAX_PHOTO_BYTES = 1_500_000;

/** Stores a building photo (JPEG, PNG, or WebP up to 1.5 MB) shown on its card. */
export async function uploadBuildingPhotoAction(id: string, formData: FormData): Promise<Result> {
  await requireRole(...ADMIN_ROLES);
  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a photo." };
  if (!PHOTO_TYPES.includes(file.type)) return { ok: false, error: "Use a JPEG, PNG, or WebP photo." };
  if (file.size > MAX_PHOTO_BYTES) return { ok: false, error: "The photo is too large; choose one under 1.5 MB." };
  await prisma.building.update({
    where: { id },
    data: { photo: new Uint8Array(await file.arrayBuffer()), photoType: file.type, photoUpdatedAt: new Date() },
  });
  return done();
}

export async function removeBuildingPhotoAction(id: string): Promise<Result> {
  await requireRole(...ADMIN_ROLES);
  await prisma.building.update({ where: { id }, data: { photo: null, photoType: null, photoUpdatedAt: null } });
  return done();
}

export async function deleteBuildingAction(id: string): Promise<Result> {
  await requireRole(...ADMIN_ROLES);
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
  await requireRole(...ADMIN_ROLES);
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
  await requireRole(...ADMIN_ROLES);
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
  departmentId: z.string().optional(),
});

const OWN_ROOMS = "You can only manage rooms that belong to your department.";

export async function saveRoomAction(id: string | null, formData: FormData): Promise<Result> {
  const scope = await requireScope(...ADMIN_ROLES);
  const parsed = roomSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const d = parsed.data;
  const unassigned = d.departmentId === UNASSIGNED;
  const departmentId = unassigned ? null : d.departmentId || null;
  if (departmentId && !await prisma.department.findUnique({ where: { id: departmentId }, select: { id: true } })) {
    return { ok: false, error: "The selected department no longer exists. Refresh and try again." };
  }
  if (!canManageDepartment(scope, departmentId)) return { ok: false, error: OWN_ROOMS };
  if (id) {
    const existing = await prisma.room.findUnique({ where: { id }, select: { departmentId: true, archivedAt: true } });
    if (!existing) return { ok: false, error: "This room no longer exists. Refresh the page." };
    if (!canManageDepartment(scope, existing?.departmentId)) return { ok: false, error: OWN_ROOMS };
    if (existing.archivedAt) return { ok: false, error: "This room was archived and is kept for history. Create a new room instead." };
  }
  const duplicate = await prisma.room.findFirst({
    where: { roomNumber: d.roomNumber, archivedAt: null, ...(id ? { id: { not: id } } : {}) },
    select: { id: true, departmentId: true, floor: { select: { name: true, building: { select: { name: true } } } } },
  });
  if (duplicate) {
    if (!canManageDepartment(scope, duplicate.departmentId)) return { ok: false, error: OWN_ROOMS };
    const location = duplicate.floor ? ` in ${duplicate.floor.building.name}, ${duplicate.floor.name}` : "";
    return { ok: false, error: `Room number "${d.roomNumber}" already belongs to an active room${location}. Open that building to edit it, or use another room number.` };
  }
  const data = {
    ...d,
    departmentId,
    isGeneralShared: departmentId === null && !unassigned,
    programs: { set: [] },
    equipment: d.equipment ? d.equipment.split(",").map((e) => e.trim()).filter(Boolean) : [],
  };
  try {
    if (id) await prisma.room.update({ where: { id, archivedAt: null }, data });
    else {
      const last = await prisma.room.aggregate({ where: { floorId: d.floorId }, _max: { sortOrder: true } });
      await prisma.room.create({
        data: {
          ...data,
          programs: { connect: [] },
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
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") return { ok: false, error: `An active room already uses room number "${d.roomNumber}". Refresh the page or use another room number.` };
      if (error.code === "P2003") return { ok: false, error: "The selected floor or department no longer exists. Refresh the page and choose again." };
      if (error.code === "P2025") return { ok: false, error: "The room has changed or no longer exists. Refresh the page and try again." };
    }
    console.error("[rooms] Could not save room", { code: error instanceof Prisma.PrismaClientKnownRequestError ? error.code : "UNKNOWN" });
    return { ok: false, error: "Could not save the room. Please try again." };
  }
  return done();
}
