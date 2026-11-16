"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { STAFF_ROLES } from "@/lib/permissions/roles";
import { canManageDepartment, OUTSIDE_DEPARTMENT, policyUserFromScope, requireScope, type Scope } from "@/lib/permissions/scope";
import { can } from "@/lib/permissions/policy";
import { canManageSubject } from "@/lib/subjects/permissions";
import { canManageSection } from "@/lib/sections/permissions";
import { logBlocked } from "@/lib/permissions/department";
import { activeClassesOf, setArchived } from "@/lib/archive/archive";
import { ARCHIVE_KINDS, type ArchiveKind } from "@/lib/archive/kinds";
import { queueWorkloadCheck, runWorkloadCheck } from "@/lib/workload/auto";
import { DepartmentHeadConflictError } from "@/lib/departments/heads";

export type ArchiveResult =
  | { ok: true; message: string }
  | { ok: false; error: string }
  /** The record still has classes this term; the caller confirms before archiving. */
  | { ok: false; classes: string[]; teaching: boolean; learners?: number };

const schema = z.object({
  kind: z.enum(ARCHIVE_KINDS),
  id: z.string().min(1),
  reason: z.string().trim().max(300).optional(),
  confirmed: z.boolean().default(false),
});

const PATHS = ["/admin/users", "/admin/users/archived", "/admin/departments", "/faculty", "/subjects", "/rooms", "/sections", "/workload"];

/** Owning department of the record, for the Head of Department check. */
async function departmentOf(kind: ArchiveKind, id: string) {
  switch (kind) {
    case "ROOM":
      return (await prisma.room.findUnique({ where: { id }, select: { departmentId: true } }))?.departmentId;
    case "SUBJECT":
      return (await prisma.subject.findUnique({ where: { id }, select: { departmentId: true } }))?.departmentId;
    case "SECTION":
      return (await prisma.section.findUnique({ where: { id }, select: { departmentId: true } }))?.departmentId;
    default:
      return null;
  }
}

async function allowed(scope: Scope, kind: ArchiveKind, id: string) {
  // Accounts are the Super Administrator's, faculty records the Registrar's; other records follow their pages' department rules.
  if (kind === "USER") return scope.role === "SUPER_ADMINISTRATOR";
  if (kind === "FACULTY") return scope.isAdmin;
  if (kind === "ROOM") return can(policyUserFromScope(scope), "archive", { type: "room" });
  const departmentId = await departmentOf(kind, id);
  if (kind === "SUBJECT") return canManageSubject(scope, { departmentId });
  if (kind === "SECTION") return canManageSection(scope, { departmentId });
  return canManageDepartment(scope, departmentId);
}

const REFUSED: Partial<Record<ArchiveKind, string>> = {
  USER: "Only the Super Administrator can archive user accounts.",
  FACULTY: "Only the Registrar can edit faculty records.",
  ROOM: "Rooms are read-only for department heads. Contact the Registrar for updates.",
};

/** Archives a record instead of deleting it; warns first when classes this term still use it. */
export async function archiveRecordAction(input: z.input<typeof schema>): Promise<ArchiveResult> {
  const scope = await requireScope(...STAFF_ROLES);
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const { kind, id, reason, confirmed } = parsed.data;
  if (!(await allowed(scope, kind, id))) {
    await logBlocked(scope, `archive a ${kind.toLowerCase()} record`, kind, id);
    return { ok: false, error: REFUSED[kind] ?? OUTSIDE_DEPARTMENT };
  }
  if (kind === "USER" && id === scope.userId) return { ok: false, error: "You cannot archive your own account." };
  if (kind === "FACULTY" && id === scope.facultyId) return { ok: false, error: "You cannot archive your own faculty record." };

  const teaching = kind === "USER" || kind === "FACULTY";
  const classes = await activeClassesOf(kind, id);
  const learners = kind === "SECTION" ? (await prisma.section.findUnique({ where: { id }, select: { studentCount: true } }))?.studentCount ?? 0 : 0;
  if ((classes.length > 0 || learners > 0) && !confirmed) return { ok: false, classes, teaching, learners };

  const name = await setArchived(kind, id, scope.userId, true, reason);
  PATHS.forEach((p) => revalidatePath(p));

  // An archived faculty member counts as inactive, so the workload check proposes new teachers for their classes.
  if (teaching && classes.length > 0) {
    const status = await runWorkloadCheck(`${name} was archived`, scope.userId);
    return { ok: true, message: `${name} was archived; ${status.proposed} reassignment proposal(s) await Head of Department approval in Faculty Workload.` };
  }
  queueWorkloadCheck(`${name} was archived`, scope.userId);
  return { ok: true, message: `${name} was archived. Restore it any time from the Archived list.` };
}

/** Brings an archived record back with all of its past data. */
export async function restoreRecordAction(kind: ArchiveKind, id: string): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const scope = await requireScope(...STAFF_ROLES);
  if (!ARCHIVE_KINDS.includes(kind)) return { ok: false, error: "Invalid request." };
  if (!(await allowed(scope, kind, id))) {
    await logBlocked(scope, `restore a ${kind.toLowerCase()} record`, kind, id);
    return { ok: false, error: REFUSED[kind] ?? OUTSIDE_DEPARTMENT };
  }
  let name: string;
  try {
    name = await setArchived(kind, id, scope.userId, false);
  } catch (error) {
    if (error instanceof DepartmentHeadConflictError) return { ok: false, error: error.message };
    throw error;
  }
  PATHS.forEach((p) => revalidatePath(p));
  queueWorkloadCheck(`${name} was restored`, scope.userId);
  return { ok: true, message: `${name} was restored.` };
}
