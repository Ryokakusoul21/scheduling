"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { queueWorkloadCheck } from "@/lib/workload/auto";
import { STAFF_ROLES } from "@/lib/permissions/roles";
import { requireScope, type Scope } from "@/lib/permissions/scope";
import { validateRooms, validateSubjects, type ImportKind, type RoomRow, type RowResult, type SubjectRow } from "@/lib/import/specs";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

const recordsSchema = z.array(z.record(z.string(), z.string().max(500))).min(1, "The file has no data rows.").max(1000, "Import at most 1,000 rows at a time.");

/** Validates against the live database and the caller's department scope. */
async function validate(kind: ImportKind, records: Record<string, string>[], scope: Scope): Promise<RowResult<unknown>[]> {
  if (kind === "subjects") {
    const [programs, existing] = await Promise.all([
      prisma.program.findMany({ select: { code: true, level: true, departmentId: true } }),
      prisma.subject.findMany({ select: { code: true } }),
    ]);
    return validateSubjects(records, { programs, existingCodes: existing.map((s) => s.code) }).map((r) => {
      if (!r.data || scope.isAdmin) return r;
      const program = programs.find((p) => p.code === r.data!.programCode);
      // A Head of Department may only add subjects to their own department's programs.
      return program?.departmentId === scope.departmentId ? r : { ...r, data: null, errors: ["You can only import subjects for programs in your department."] };
    });
  }
  const [rooms, departments, floors] = await Promise.all([
    prisma.room.findMany({ select: { roomNumber: true } }),
    prisma.department.findMany({ select: { id: true, code: true, name: true } }),
    prisma.floor.findMany({ select: { name: true, building: { select: { name: true } } } }),
  ]);
  return validateRooms(records, {
    existingNumbers: rooms.map((r) => r.roomNumber),
    departments,
    floors: floors.map((f) => ({ building: f.building.name, floor: f.name })),
  }).map((r) => {
    if (!r.data || scope.isAdmin) return r;
    // Rooms imported by a Head of Department always belong to their department.
    if (r.data.departmentId && r.data.departmentId !== scope.departmentId) return { ...r, data: null, errors: ["You can only import rooms for your department."] };
    return { ...r, data: { ...r.data, departmentId: scope.departmentId } };
  });
}

export async function validateImportAction(kind: ImportKind, records: Record<string, string>[]): Promise<Result<RowResult<unknown>[]>> {
  const scope = await requireScope(...STAFF_ROLES);
  const parsed = recordsSchema.safeParse(records);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid data." };
  return { ok: true, data: await validate(kind, parsed.data, scope) };
}

/** Saves every valid row in one transaction; invalid rows are skipped and reported back. */
export async function commitImportAction(kind: ImportKind, records: Record<string, string>[]): Promise<Result<{ saved: number; skipped: number }>> {
  const scope = await requireScope(...STAFF_ROLES);
  const parsed = recordsSchema.safeParse(records);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid data." };
  const results = await validate(kind, parsed.data, scope);
  const valid = results.filter((r) => r.data);
  if (valid.length === 0) return { ok: false, error: "No valid rows to save. Fix the highlighted errors and try again." };

  try {
    if (kind === "subjects") {
      const programs = new Map((await prisma.program.findMany({ select: { id: true, code: true } })).map((p) => [p.code, p.id]));
      await prisma.subject.createMany({
        data: valid.map((r) => {
          const { programCode, ...d } = r.data as SubjectRow;
          return { ...d, programId: programCode ? programs.get(programCode) ?? null : null };
        }),
      });
    } else {
      await prisma.$transaction(async (tx) => {
        for (const r of valid) {
          const d = r.data as RoomRow;
          const building =
            (await tx.building.findFirst({ where: { name: { equals: d.building, mode: "insensitive" } } })) ??
            (await tx.building.create({ data: { name: d.building } }));
          const floor =
            (await tx.floor.findFirst({ where: { buildingId: building.id, name: { equals: d.floor, mode: "insensitive" } } })) ??
            (await tx.floor.create({ data: { buildingId: building.id, name: d.floor, number: (await tx.floor.count({ where: { buildingId: building.id } })) + 1 } }));
          await tx.room.create({
            data: {
              roomNumber: d.roomNumber, roomName: d.roomName, floorId: floor.id, capacity: d.capacity, roomType: d.roomType,
              equipment: d.equipment, departmentId: d.departmentId,
              availability: { create: (["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"] as const).map((day) => ({ dayOfWeek: day, startMin: 7 * 60, endMin: 19 * 60 })) },
            },
          });
        }
      }, { timeout: 60000 });
    }
  } catch {
    return { ok: false, error: "Saving failed because the data changed while importing. Validate again and retry." };
  }

  await prisma.auditLog.create({
    data: { userId: scope.userId, action: `Imported ${valid.length} ${kind} in bulk`, entity: kind === "subjects" ? "Subject" : "Room", newValue: { saved: valid.length, skipped: results.length - valid.length } },
  });
  revalidatePath(kind === "subjects" ? "/subjects" : "/rooms");
  revalidatePath("/scheduler");
  queueWorkloadCheck("Subjects or rooms were imported");
  return { ok: true, data: { saved: valid.length, skipped: results.length - valid.length } };
}
