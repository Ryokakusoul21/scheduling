import "server-only";
import { cache } from "react";
import { requireRole, requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { isAdmin, type AppRole } from "./roles";
import { can, resolveProgramIds, type PolicyUser } from "./policy";

/** Who the signed-in user is and which department they may manage (null means every department). */
export interface Scope {
  userId: string;
  name: string;
  role: AppRole;
  status: string;
  archivedAt: Date | null;
  facultyId: string | null;
  /** Own department from the linked faculty record. */
  departmentId: string | null;
  /** All permanent and currently-active acting assignments. */
  departmentIds: string[];
  actingDepartmentIds: string[];
  /** Active program restriction (empty means the whole department); derived from stored assignments, never from the request. */
  programIds: string[];
  /** Department filter for management screens: null for Registrar, own department for Head of Department. */
  manageDepartmentId: string | null;
  isAdmin: boolean;
}

/** Built once per request and user; layouts, pages, and streamed sections all share it. */
const buildScope = cache(async (user: { id: string; name?: string | null; role: string }) => loadScope(user));

async function loadScope(user: { id: string; name?: string | null; role: string }): Promise<Scope> {
  const role = user.role as AppRole;
  const now = new Date();
  const me = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      facultyId: true,
      status: true,
      archivedAt: true,
      faculty: { select: { departmentId: true } },
      departmentAssignments: {
        where: { AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gte: now } }] }] },
        select: { departmentId: true, acting: true },
      },
      programAssignments: { select: { programId: true, startDate: true, endDate: true, program: { select: { departmentId: true } } } },
    },
  });
  const fallbackDepartmentId = me?.faculty?.departmentId ?? null;
  const assigned = me?.departmentAssignments ?? [];
  const departmentIds = [...new Set([...assigned.map((item) => item.departmentId), ...(fallbackDepartmentId ? [fallbackDepartmentId] : [])])];
  const actingDepartmentIds = assigned.filter((item) => item.acting).map((item) => item.departmentId);
  const departmentId = departmentIds[0] ?? null;
  const programIds = role === "HEAD_OF_DEPARTMENT"
    ? resolveProgramIds((me?.programAssignments ?? []).map((a) => ({ programId: a.programId, programDepartmentId: a.program.departmentId, startDate: a.startDate, endDate: a.endDate })), departmentIds, now)
    : [];
  return {
    userId: user.id,
    name: user.name ?? "",
    role,
    status: me?.status ?? "ARCHIVED",
    archivedAt: me ? me.archivedAt : new Date(0),
    facultyId: me?.facultyId ?? null,
    departmentId,
    departmentIds,
    actingDepartmentIds,
    programIds,
    // A Head of Department without a department manages nothing rather than everything.
    manageDepartmentId: isAdmin(role) ? null : (departmentId ?? "__none__"),
    isAdmin: isAdmin(role),
  };
}

/** Lossless policy input for UI serialization and server-side decisions. */
export function policyUserFromScope(scope: Scope): PolicyUser {
  return {
    id: scope.userId,
    role: scope.role,
    status: scope.status,
    archivedAt: scope.archivedAt,
    departmentId: scope.departmentId,
    departmentIds: scope.departmentIds,
    actingDepartmentIds: scope.actingDepartmentIds,
    programIds: scope.programIds,
    facultyId: scope.facultyId,
  };
}

export async function getScope() {
  return buildScope(await requireUser());
}

/** Requires one of the roles and returns the caller's scope. */
export async function requireScope(...roles: AppRole[]) {
  return buildScope(await requireRole(...roles));
}

/** True when the scope may manage records owned by the department (null owner means shared, Registrar only). */
export function canManageDepartment(scope: Scope, departmentId: string | null | undefined) {
  return can(policyUserFromScope(scope), "edit", { type: "program", departmentId });
}

/** Owning department of a college course or Senior High School strand (null when none). */
export async function programDepartment(programId: string | null | undefined) {
  if (!programId) return null;
  return (await prisma.program.findUnique({ where: { id: programId }, select: { departmentId: true } }))?.departmentId ?? null;
}

export const OUTSIDE_DEPARTMENT = "You can only manage records of your own department. Ask the Registrar for anything else.";
