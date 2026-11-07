import "server-only";
import { prisma } from "@/lib/db/prisma";
import { notifyManagers, notifyUsers } from "@/lib/notify";
import type { AppRole } from "@/lib/permissions/roles";
import type { Scope } from "@/lib/permissions/scope";
import { checkClass, writeClass, type ClassData, type SaveResult } from "@/lib/scheduler/class-save";
import { DAY_LONG, formatRange } from "@/lib/scheduler/timetable";

/** Other departments owning the chosen faculty member or room; shared rooms belong to everyone. */
export async function foreignDepartments(scope: Scope, facultyId: string, roomId: string) {
  if (scope.isAdmin) return [];
  const [faculty, room] = await Promise.all([
    prisma.faculty.findUnique({ where: { id: facultyId }, select: { departmentId: true } }),
    prisma.room.findUnique({ where: { id: roomId }, select: { departmentId: true } }),
  ]);
  return [...new Set([faculty?.departmentId, room?.departmentId].filter((d): d is string => !!d && d !== scope.departmentId))];
}

export interface CrossDepartmentDetails {
  kind: "CROSS_DEPARTMENT_CLASS";
  /** The class exactly as it will be saved when approved. */
  input: ClassData;
  summary: string;
  requesterRole: AppRole;
}

/**
 * Files a request instead of saving: the class needs another department's faculty member or room. Only
 * free resources reach this point (the double-booking check runs first). One other department approves
 * its own request; when two are involved, the Registrar decides.
 */
export async function requestCrossDepartment(scope: Scope, input: ClassData, departments: string[]): Promise<SaveResult> {
  const [subject, section, faculty, room] = await Promise.all([
    prisma.subject.findUnique({ where: { id: input.subjectId }, select: { code: true } }),
    prisma.section.findUnique({ where: { id: input.sectionId }, select: { name: true } }),
    prisma.faculty.findUnique({ where: { id: input.facultyId }, select: { fullName: true } }),
    prisma.room.findUnique({ where: { id: input.roomId }, select: { roomName: true } }),
  ]);
  const summary = `${subject?.code} ${section?.name}, ${DAY_LONG[input.dayOfWeek]} ${formatRange(input.startMin, input.endMin)}, ${room?.roomName}, ${faculty?.fullName}`;
  const target = departments.length === 1 ? departments[0] : null;
  const details: CrossDepartmentDetails = { kind: "CROSS_DEPARTMENT_CLASS", input, summary, requesterRole: scope.role };
  const request = await prisma.scheduleRequest.create({
    data: {
      type: "CROSS_DEPARTMENT",
      scheduleId: input.id ?? null,
      requestedById: scope.userId,
      departmentId: scope.departmentId,
      targetDepartmentId: target,
      details: details as never,
      reason: `Uses another department's ${departments.length > 1 ? "faculty member and room" : "resource"}: ${summary}`,
    },
  });
  await notifyManagers(target, {
    title: "Request to use your department's resource",
    message: `${scope.name} asks to schedule ${summary}. Approve or reject it in Schedule Requests.`,
    link: "/requests",
  });
  await prisma.auditLog.create({ data: { userId: scope.userId, role: scope.role, departmentId: scope.departmentId, action: "Requested another department's resource", entity: "ScheduleRequest", entityId: request.id, newValue: { summary } } });
  return { ok: false, requested: true, error: "That faculty member or room belongs to another department and is free at this time. A request was sent to that department for approval." };
}

/** Applies an approved request: the class is checked again (the slot may have filled since) and then saved. */
export async function applyCrossDepartment(requestId: string, reviewer: { userId: string; name: string }) {
  const request = await prisma.scheduleRequest.findUnique({ where: { id: requestId } });
  const details = request?.details as unknown as CrossDepartmentDetails | undefined;
  if (!request || details?.kind !== "CROSS_DEPARTMENT_CLASS") return "This request has no class to apply.";
  const problem = await checkClass(details.input, { userId: reviewer.userId }, { overrideSoft: true });
  if (problem) return `It can no longer be applied: ${problem.error}`;
  const res = await writeClass(details.input, { userId: request.requestedById, role: details.requesterRole }, `Applied approved cross-department request (approved by ${reviewer.name})`);
  if (!res.ok) return res.error;
  await prisma.scheduleRequest.update({ where: { id: requestId }, data: { status: "COMPLETED", scheduleId: res.data.id } });
  await notifyUsers([request.requestedById], { title: "Request approved and applied", message: `${details.summary} is now on the timetable.`, link: "/scheduler", type: "SUCCESS" });
  return null;
}
