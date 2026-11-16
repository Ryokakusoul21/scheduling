"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { canManageDepartment, OUTSIDE_DEPARTMENT, policyUserFromScope, requireScope, type Scope } from "@/lib/permissions/scope";
import { can } from "@/lib/permissions/policy";
import { prisma } from "@/lib/db/prisma";
import { queueWorkloadCheck } from "@/lib/workload/auto";
import { employeeIdSchema } from "@/lib/faculty/employee-id";
import { ACADEMIC_LEVELS } from "@/lib/academics/levels";
import { assertSingleDepartmentHead, lockDepartmentHeads } from "@/lib/departments/head-guard";
import { DepartmentHeadConflictError } from "@/lib/departments/heads";

const STAFF = ["SUPER_ADMINISTRATOR", "REGISTRAR", "HEAD_OF_DEPARTMENT"] as const;

/** FormData -> object, keeping repeated keys (checkbox groups) as arrays. */
function formObject(formData: FormData) {
  const out: Record<string, unknown> = Object.fromEntries(formData);
  out.teachingLevels = formData.getAll("teachingLevels");
  return out;
}

const schema = z.object({
  employeeId: employeeIdSchema,
  fullName: z.string().min(1),
  email: z.string().email(),
  departmentId: z.string().optional(),
  position: z.string().optional(),
  specialization: z.string().optional(),
  maxHours: z.coerce.number().int().min(1).max(80),
  status: z.enum(["ACTIVE", "INACTIVE", "ON_LEAVE"]),
  employmentType: z.enum(["FULL_TIME", "PART_TIME"]),
  dayOff: z.enum(["", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"]).optional(),
  teachingLevels: z.array(z.enum(ACADEMIC_LEVELS)).min(1, "Choose at least one teaching level"),
});

function clean(d: z.infer<typeof schema>, scope: Scope) {
  const departmentId = scope.isAdmin ? d.departmentId || null : scope.departmentId;
  // Only part-time faculty have a day off.
  return { ...d, departmentId, position: d.position || null, specialization: d.specialization || null, dayOff: d.employmentType === "PART_TIME" ? d.dayOff || null : null };
}

async function ownsFaculty(scope: Scope, id: string) {
  const f = await prisma.faculty.findUnique({ where: { id }, select: { departmentId: true } });
  return canManageDepartment(scope, f?.departmentId);
}

export async function createFacultyAction(formData: FormData) {
  const scope = await requireScope(...STAFF);
  if (!can(policyUserFromScope(scope), "create", { type: "faculty" })) return { ok: false, error: "Faculty information is read-only. Contact the Registrar for updates." };
  const parsed = schema.safeParse(formObject(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  if (!scope.isAdmin && !scope.departmentId) return { ok: false, error: OUTSIDE_DEPARTMENT };
  try {
    await prisma.faculty.create({
      data: {
        ...clean(parsed.data, scope),
        availability: {
          create: (["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"] as const).map((d) => ({
            dayOfWeek: d,
            startMin: 7 * 60,
            endMin: 18 * 60,
          })),
        },
      },
    });
    revalidatePath("/faculty");
    queueWorkloadCheck("A faculty member was added");
    return { ok: true };
  } catch {
    return { ok: false, error: "A faculty member with that employee ID or email already exists." };
  }
}

export async function updateFacultyAction(id: string, formData: FormData) {
  const scope = await requireScope(...STAFF);
  if (!can(policyUserFromScope(scope), "edit", { type: "faculty" })) return { ok: false, error: "Faculty information is read-only. Contact the Registrar for updates." };
  const parsed = schema.safeParse(formObject(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  if (!(await ownsFaculty(scope, id))) return { ok: false, error: OUTSIDE_DEPARTMENT };
  try {
    await prisma.$transaction(async (tx) => {
      await lockDepartmentHeads(tx);
      const faculty = await tx.faculty.update({ where: { id }, data: clean(parsed.data, scope), select: { fullName: true, user: { select: { id: true, name: true } } } });
      if (faculty.user) {
        if (faculty.user.name !== faculty.fullName) {
          await tx.user.update({ where: { id: faculty.user.id }, data: { name: faculty.fullName } });
          await tx.auditLog.create({ data: { userId: scope.userId, role: scope.role, entity: "User", entityId: faculty.user.id,
            action: "Synced account name from Registrar faculty record", oldValue: { name: faculty.user.name }, newValue: { name: faculty.fullName, facultyId: id } } });
        }
        await assertSingleDepartmentHead(tx, faculty.user.id);
      }
    });
  } catch (error) {
    if (error instanceof DepartmentHeadConflictError) return { ok: false, error: error.message };
    return { ok: false, error: "Another faculty member already uses that employee ID or email." };
  }
  revalidatePath("/faculty");
  revalidatePath("/admin/departments");
  revalidatePath("/admin/users");
  queueWorkloadCheck("A faculty member was updated");
  return { ok: true };
}

/** Ordered preferred rooms (at most three); only the Head of Department and the Registrar can set them. */
export async function saveRoomPreferencesAction(facultyId: string, roomIds: string[]) {
  const scope = await requireScope("HEAD_OF_DEPARTMENT", "REGISTRAR");
  const ids = [...new Set(roomIds)].slice(0, 3);
  const faculty = await prisma.faculty.findUnique({ where: { id: facultyId }, select: { departmentId: true } });
  if (!faculty || !canManageDepartment(scope, faculty.departmentId)) return { ok: false, error: OUTSIDE_DEPARTMENT };
  // A Head of Department chooses from the department's rooms and shared rooms.
  const rooms = await prisma.room.findMany({ where: { id: { in: ids }, archivedAt: null, ...(scope.isAdmin ? {} : { OR: [{ departmentId: faculty.departmentId }, { departmentId: null }] }) }, select: { id: true } });
  if (rooms.length !== ids.length) return { ok: false, error: "Choose rooms from your department or shared rooms." };
  await prisma.$transaction([
    prisma.facultyRoomPreference.deleteMany({ where: { facultyId } }),
    prisma.facultyRoomPreference.createMany({ data: ids.map((roomId, i) => ({ facultyId, roomId, rank: i + 1 })) }),
    prisma.auditLog.create({ data: { userId: scope.userId, action: "UPDATE_ROOM_PREFERENCES", entity: "Faculty", entityId: facultyId, newValue: { roomIds: ids } } }),
  ]);
  revalidatePath("/faculty");
  revalidatePath("/scheduler");
  return { ok: true };
}
