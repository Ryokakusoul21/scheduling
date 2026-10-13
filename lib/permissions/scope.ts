import "server-only";
import { requireRole, requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import type { AppRole } from "./roles";

/** Who the signed-in user is and which department they may manage (null means every department). */
export interface Scope {
  userId: string;
  name: string;
  role: AppRole;
  facultyId: string | null;
  /** Own department from the linked faculty record. */
  departmentId: string | null;
  /** Department filter for management screens: null for Administrator, own department for Head of Department. */
  manageDepartmentId: string | null;
  isAdmin: boolean;
}

async function buildScope(user: { id: string; name?: string | null; role: string }): Promise<Scope> {
  const role = user.role as AppRole;
  const me = await prisma.user.findUnique({
    where: { id: user.id },
    select: { facultyId: true, faculty: { select: { departmentId: true } } },
  });
  const departmentId = me?.faculty?.departmentId ?? null;
  return {
    userId: user.id,
    name: user.name ?? "",
    role,
    facultyId: me?.facultyId ?? null,
    departmentId,
    // A Head of Department without a department manages nothing rather than everything.
    manageDepartmentId: role === "ADMINISTRATOR" ? null : (departmentId ?? "__none__"),
    isAdmin: role === "ADMINISTRATOR",
  };
}

export async function getScope() {
  return buildScope(await requireUser());
}

/** Requires one of the roles and returns the caller's scope. */
export async function requireScope(...roles: AppRole[]) {
  return buildScope(await requireRole(...roles));
}

/** True when the scope may manage records owned by the department (null owner means shared, Administrator only). */
export function canManageDepartment(scope: Scope, departmentId: string | null | undefined) {
  if (scope.isAdmin) return true;
  if (scope.role !== "HEAD_OF_DEPARTMENT") return false;
  return !!departmentId && departmentId === scope.departmentId;
}

/** Owning department of a college course or Senior High School strand (null when none). */
export async function programDepartment(programId: string | null | undefined) {
  if (!programId) return null;
  return (await prisma.program.findUnique({ where: { id: programId }, select: { departmentId: true } }))?.departmentId ?? null;
}

export const OUTSIDE_DEPARTMENT = "You can only manage records of your own department. Ask the Administrator for anything else.";
