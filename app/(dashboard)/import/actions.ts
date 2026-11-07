"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { queueWorkloadCheck } from "@/lib/workload/auto";
import { STAFF_ROLES } from "@/lib/permissions/roles";
import { requireScope, type Scope } from "@/lib/permissions/scope";
import { canManageSubject } from "@/lib/subjects/permissions";
import { logBlocked } from "@/lib/permissions/department";
import { notifyFacultyEach } from "@/lib/notify";
import { validateRooms, validateSubjects, type ImportKind, type RoomRow, type RowResult, type SubjectRow } from "@/lib/import/specs";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

const recordsSchema = z.array(z.record(z.string(), z.string().max(500))).min(1, "The file has no data rows.").max(1000, "Import at most 1,000 rows at a time.");

/** The active term an imported subject's assignment goes into: the program's own term, else the level-wide one. */
function activeTerm<T extends { level: string; programId: string | null }>(terms: T[], level: string, programId: string | null) {
  return terms.find((t) => t.level === level && programId && t.programId === programId) ?? terms.find((t) => t.level === level && !t.programId);
}

/** Validates against the live database and the caller's department scope. */
async function validate(kind: ImportKind, records: Record<string, string>[], scope: Scope): Promise<RowResult<unknown>[]> {
  if (kind === "subjects") {
    const [programs, existing, faculty, terms] = await Promise.all([
      prisma.program.findMany({ select: { id: true, code: true, level: true, departmentId: true } }),
      prisma.subject.findMany({ select: { code: true } }),
      prisma.faculty.findMany({ where: { status: "ACTIVE", archivedAt: null }, select: { id: true, email: true, employeeId: true } }),
      prisma.semester.findMany({ where: { isActive: true }, select: { level: true, programId: true } }),
    ]);
    return validateSubjects(records, { programs, existingCodes: existing.map((s) => s.code), faculty }).map((r) => {
      const program = programs.find((p) => p.code === r.data?.programCode);
      if (r.data?.facultyId && !activeTerm(terms, r.data.level, program?.id ?? null)) r = { ...r, warnings: [...r.warnings, "There is no active term for this level, so the faculty will not be assigned."] };
      if (!r.data || scope.isAdmin) return r;
      // A Head of Department may only add subjects to their own department's programs; General Education subjects are the Registrar's.
      return canManageSubject({ role: scope.role, departmentId: scope.departmentId }, { departmentId: program?.departmentId }) ? r : { ...r, data: null, errors: ["You can only import subjects owned by your department."] };
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
    // Rooms imported by a Head of Department always belong to their department and go into existing buildings and floors.
    if (!scope.departmentId || (r.data.departmentId && r.data.departmentId !== scope.departmentId)) return { ...r, data: null, errors: ["You can only import rooms for your department."] };
    const known = floors.some((x) => x.building.name.toLowerCase() === r.data!.building.toLowerCase() && x.name.toLowerCase() === r.data!.floor.toLowerCase());
    if (!known) return { ...r, data: null, errors: ["That building and floor do not exist yet. Ask the Registrar to add them first."] };
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
      const programs = new Map((await prisma.program.findMany({ select: { id: true, code: true, departmentId: true } })).map((p) => [p.code, p]));
      const blocked = valid.some((r) => {
        const row = r.data as SubjectRow;
        const departmentId = row.programCode ? programs.get(row.programCode)?.departmentId : null;
        return !canManageSubject({ role: scope.role, departmentId: scope.departmentId }, { departmentId });
      });
      if (blocked) {
        await logBlocked(scope, "bulk-import subjects outside the department", "Subject");
        return { ok: false, error: "You can only import subjects owned by your department. The blocked attempt was logged." };
      }
      const rows = valid.map((r) => {
        const { programCode, facultyId, ...d } = r.data as SubjectRow;
        const program = programCode ? programs.get(programCode) : undefined;
        return { facultyId, subject: { ...d, id: crypto.randomUUID(), programId: program?.id ?? null, departmentId: program?.departmentId ?? null } };
      });
      const terms = await prisma.semester.findMany({ where: { isActive: true }, select: { id: true, name: true, level: true, programId: true } });
      const assignments = rows.flatMap((r) => {
        const term = r.facultyId ? activeTerm(terms, r.subject.level, r.subject.programId) : undefined;
        return term ? [{ subjectId: r.subject.id, code: r.subject.code, facultyId: r.facultyId!, semesterId: term.id, term: term.name }] : [];
      });
      await prisma.$transaction([
        prisma.subject.createMany({ data: rows.map((r) => r.subject) }),
        prisma.subjectAssignment.createMany({ data: assignments.map(({ subjectId, facultyId, semesterId }) => ({ subjectId, facultyId, semesterId, assignedById: scope.userId })) }),
        prisma.auditLog.createMany({ data: assignments.map((a) => ({ userId: scope.userId, role: scope.role, entity: "SubjectAssignment", entityId: a.subjectId, action: `Assigned ${a.code} through bulk import (${a.term}, all sections)`, newValue: { facultyId: a.facultyId, semesterId: a.semesterId } })) }),
      ]);
      await notifyFacultyEach([...new Set(assignments.map((a) => a.facultyId))].map((id) => ({
        facultyIds: [id], msg: { title: "New subject assignment", message: `You were assigned ${assignments.filter((a) => a.facultyId === id).map((a) => a.code).join(", ")} for every section.`, link: "/my-subjects" },
      })));
    } else {
      await prisma.$transaction(async (tx) => {
        const rooms = valid.map((r) => r.data as RoomRow);
        const key = (s: string) => s.trim().toLowerCase();
        const [buildings, floors] = await Promise.all([tx.building.findMany({ select: { id: true, name: true } }), tx.floor.findMany({ select: { id: true, name: true, buildingId: true } })]);
        const buildingId = new Map(buildings.map((b) => [key(b.name), b.id]));
        const floorId = new Map(floors.map((f) => [`${f.buildingId}|${key(f.name)}`, f.id]));
        const floorCount = new Map<string, number>();
        floors.forEach((f) => floorCount.set(f.buildingId, (floorCount.get(f.buildingId) ?? 0) + 1));
        // Only buildings and floors that do not exist yet are created, one at a time and only once each.
        for (const d of rooms) {
          if (!buildingId.has(key(d.building))) buildingId.set(key(d.building), (await tx.building.create({ data: { name: d.building } })).id);
          const b = buildingId.get(key(d.building))!;
          if (!floorId.has(`${b}|${key(d.floor)}`)) {
            const number = (floorCount.get(b) ?? 0) + 1;
            floorCount.set(b, number);
            floorId.set(`${b}|${key(d.floor)}`, (await tx.floor.create({ data: { buildingId: b, name: d.floor, number } })).id);
          }
        }
        const rows = rooms.map((d) => ({
          id: crypto.randomUUID(), roomNumber: d.roomNumber, roomName: d.roomName, floorId: floorId.get(`${buildingId.get(key(d.building))}|${key(d.floor)}`)!,
          capacity: d.capacity, roomType: d.roomType, equipment: d.equipment, departmentId: d.departmentId,
        }));
        await tx.room.createMany({ data: rows });
        await tx.roomAvailability.createMany({
          data: rows.flatMap((r) => (["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"] as const).map((day) => ({ roomId: r.id, dayOfWeek: day, startMin: 7 * 60, endMin: 19 * 60 }))),
        });
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
