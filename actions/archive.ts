"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { STAFF_ROLES } from "@/lib/permissions/roles";
import { canManageDepartment, OUTSIDE_DEPARTMENT, programDepartment, requireScope, type Scope } from "@/lib/permissions/scope";
import { activeClassesOf, setArchived } from "@/lib/archive/archive";
import { ARCHIVE_KINDS, type ArchiveKind } from "@/lib/archive/kinds";
import { queueWorkloadCheck, runWorkloadCheck } from "@/lib/workload/auto";

export type ArchiveResult =
  | { ok: true; message: string }
  | { ok: false; error: string }
  /** The record still has classes this term; the caller confirms before archiving. */
  | { ok: false; classes: string[]; teaching: boolean };

const schema = z.object({
  kind: z.enum(ARCHIVE_KINDS),
  id: z.string().min(1),
  reason: z.string().trim().max(300).optional(),
  confirmed: z.boolean().default(false),
});

const PATHS = ["/admin/users", "/admin/users/archived", "/faculty", "/subjects", "/rooms", "/sections", "/workload"];

/** Owning department of the record, for the Head of Department check. */
async function departmentOf(kind: ArchiveKind, id: string) {
  switch (kind) {
    case "FACULTY":
      return (await prisma.faculty.findUnique({ where: { id }, select: { departmentId: true } }))?.departmentId;
    case "ROOM":
      return (await prisma.room.findUnique({ where: { id }, select: { departmentId: true } }))?.departmentId;
    case "SUBJECT":
      return programDepartment((await prisma.subject.findUnique({ where: { id }, select: { programId: true } }))?.programId);
    case "SECTION":
      return programDepartment((await prisma.section.findUnique({ where: { id }, select: { programId: true } }))?.programId);
    default:
      return null;
  }
}

async function allowed(scope: Scope, kind: ArchiveKind, id: string) {
  // User accounts are Administrator-only; other records follow the department rules of their pages.
  if (kind === "USER") return scope.isAdmin;
  return canManageDepartment(scope, await departmentOf(kind, id));
}

/** Archives a record instead of deleting it; warns first when classes this term still use it. */
export async function archiveRecordAction(input: z.input<typeof schema>): Promise<ArchiveResult> {
  const scope = await requireScope(...STAFF_ROLES);
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const { kind, id, reason, confirmed } = parsed.data;
  if (!(await allowed(scope, kind, id))) return { ok: false, error: kind === "USER" ? "Only the Administrator can archive user accounts." : OUTSIDE_DEPARTMENT };
  if (kind === "USER" && id === scope.userId) return { ok: false, error: "You cannot archive your own account." };
  if (kind === "FACULTY" && id === scope.facultyId) return { ok: false, error: "You cannot archive your own faculty record." };

  const teaching = kind === "USER" || kind === "FACULTY";
  const classes = await activeClassesOf(kind, id);
  if (classes.length > 0 && !confirmed) return { ok: false, classes, teaching };

  const name = await setArchived(kind, id, scope.userId, true, reason);
  PATHS.forEach((p) => revalidatePath(p));

  // An archived faculty member counts as inactive, so the workload check proposes new teachers for their classes.
  if (teaching && classes.length > 0) {
    const status = await runWorkloadCheck(`${name} was archived`, scope.userId);
    const outcome = status.mode === "AUTOMATIC" ? `${status.applied} class(es) were reassigned automatically` : `${status.proposed} reassignment proposal(s) await approval in Faculty Workload`;
    return { ok: true, message: `${name} was archived; ${outcome}.` };
  }
  queueWorkloadCheck(`${name} was archived`, scope.userId);
  return { ok: true, message: `${name} was archived. Restore it any time from the Archived list.` };
}

/** Brings an archived record back with all of its past data. */
export async function restoreRecordAction(kind: ArchiveKind, id: string): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const scope = await requireScope("ADMINISTRATOR");
  if (!ARCHIVE_KINDS.includes(kind)) return { ok: false, error: "Invalid request." };
  const name = await setArchived(kind, id, scope.userId, false);
  PATHS.forEach((p) => revalidatePath(p));
  queueWorkloadCheck(`${name} was restored`, scope.userId);
  return { ok: true, message: `${name} was restored.` };
}
