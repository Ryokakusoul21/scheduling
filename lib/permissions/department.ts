import "server-only";
import type { AcademicLevel, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { Scope } from "./scope";
import { scopeQuery } from "./policy";

type Who = Pick<Scope, "isAdmin" | "manageDepartmentId"> & Partial<Pick<Scope, "userId" | "role" | "status" | "archivedAt" | "departmentId" | "departmentIds" | "actingDepartmentIds" | "programIds" | "facultyId">>;
const toPolicyUser = (scope: Who) => ({
  id: scope.userId,
  role: scope.role ?? (scope.isAdmin ? "ADMINISTRATOR" : "DENIED"),
  status: scope.status ?? (scope.isAdmin ? "ACTIVE" : "INACTIVE"),
  archivedAt: scope.archivedAt,
  departmentId: scope.departmentId,
  departmentIds: scope.departmentIds,
  actingDepartmentIds: scope.actingDepartmentIds,
  programIds: scope.programIds,
  facultyId: scope.facultyId,
});

/**
 * Query filters that limit a Head of Department to the department they handle; the Administrator sees
 * everything. Records of other departments are left out of the query, so they never reach the page.
 * Shared rooms and General Education subjects (no department) stay visible to every department.
 */
export const departmentWhere = {
  department: (s: Who): Prisma.DepartmentWhereInput => scopeQuery(toPolicyUser(s), "department") as Prisma.DepartmentWhereInput,
  program: (s: Who): Prisma.ProgramWhereInput => scopeQuery(toPolicyUser(s), "program") as Prisma.ProgramWhereInput,
  section: (s: Who): Prisma.SectionWhereInput => scopeQuery(toPolicyUser(s), "section") as Prisma.SectionWhereInput,
  subject: (s: Who): Prisma.SubjectWhereInput => scopeQuery(toPolicyUser(s), "subject") as Prisma.SubjectWhereInput,
  faculty: (s: Who): Prisma.FacultyWhereInput => scopeQuery(toPolicyUser(s), "faculty") as Prisma.FacultyWhereInput,
  room: (s: Who): Prisma.RoomWhereInput => scopeQuery(toPolicyUser(s), "room") as Prisma.RoomWhereInput,
  schedule: (s: Who): Prisma.ScheduleWhereInput => scopeQuery(toPolicyUser(s), "schedule") as Prisma.ScheduleWhereInput,
  examination: (s: Who): Prisma.ExaminationWhereInput => scopeQuery(toPolicyUser(s), "examination") as Prisma.ExaminationWhereInput,
  activity: (s: Who): Prisma.ActivityWhereInput => scopeQuery(toPolicyUser(s), "activityProposal") as Prisma.ActivityWhereInput,
};

/** Whether a room or faculty member of this department can be used directly, or needs the other department's approval. */
export function isForeign(s: Who, departmentId: string | null | undefined) {
  return !s.isAdmin && !!departmentId && !(s.departmentIds ?? []).includes(departmentId);
}

/**
 * Department a new or edited section or subject belongs to: its program's, or for basic-education records
 * the department that already owns that level (a Head of Department's own). College subjects without a
 * program are the shared General Education catalog (null).
 */
export async function recordDepartment(scope: Scope, programId: string | null, level: AcademicLevel, existing?: string | null) {
  if (programId) return (await prisma.program.findUnique({ where: { id: programId }, select: { departmentId: true } }))?.departmentId ?? null;
  if (level === "COLLEGE") return null;
  if (existing !== undefined && existing !== null) return existing;
  if (!scope.isAdmin) return scope.departmentId;
  const sibling = await prisma.section.findFirst({ where: { level, departmentId: { not: null } }, select: { departmentId: true } });
  return sibling?.departmentId ?? null;
}

/** Records a refused attempt to change data outside the person's rights. */
export async function logBlocked(scope: Pick<Scope, "userId" | "role" | "departmentId">, action: string, entity: string, entityId?: string | null) {
  const label = `Blocked: ${action}`;
  await prisma.auditLog.create({
    data: { userId: scope.userId, role: scope.role, departmentId: scope.departmentId, action: label, entity, entityId: entityId ?? null, reason: action },
  });
  const since = new Date(Date.now() - 15 * 60_000);
  const repeated = await prisma.auditLog.count({ where: { userId: scope.userId, action: { startsWith: "Blocked:" }, createdAt: { gte: since } } });
  if (repeated >= 5 && repeated % 5 === 0) {
    const administrators = await prisma.user.findMany({ where: { role: "ADMINISTRATOR", status: "ACTIVE", archivedAt: null }, select: { id: true } });
    await prisma.notification.createMany({
      data: administrators.map((administrator) => ({
        userId: administrator.id,
        type: "WARNING" as const,
        title: "Repeated blocked access attempts",
        message: `${scope.userId} has ${repeated} blocked attempts in the last 15 minutes.`,
        link: "/admin/audit-logs",
        departmentId: scope.departmentId,
      })),
    });
  }
}
