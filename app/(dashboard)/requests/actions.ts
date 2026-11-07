"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { getScope, requireScope, type Scope } from "@/lib/permissions/scope";
import { STAFF_ROLES } from "@/lib/permissions/roles";
import { formatRange } from "@/lib/scheduler/timetable";
import { canCancelRequest, canEditRequest, canReviewRequest, requestFormSchema, TYPE_LABELS, type RequestDetails, type RequestFormData, type RequestFormInput, type RequestSummary } from "@/lib/requests/rules";
import { logBlocked } from "@/lib/permissions/department";
import { notifyManagers, notifyUsers } from "@/lib/notify";
import { applyCrossDepartment } from "@/lib/requests/cross-department";
import { queueWorkloadCheck } from "@/lib/workload/auto";
import { applyFacultyChange, describeChanges, facultyChangeSchema, type FacultyChangeDetails } from "@/lib/requests/faculty-change";

type Result = { ok: true } | { ok: false; error: string };

const day = (d: string) => `${d[0]}${d.slice(1).toLowerCase()}`;
const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));

/** Checks the class, room and faculty a request names and builds the stored details, including the "current vs requested" text. */
async function prepare(scope: Scope, d: RequestFormData): Promise<{ error: string } | { departmentId: string | null; details: RequestDetails }> {
  let departmentId = scope.departmentId;
  let current: RequestSummary | undefined;
  // A related class must be one the person can see: their own or their department.
  if (d.scheduleId) {
    const row = await prisma.schedule.findFirst({
      where: { id: d.scheduleId, ...(scope.isAdmin ? {} : { OR: [{ section: { departmentId: scope.manageDepartmentId } }, ...(scope.facultyId ? [{ facultyId: scope.facultyId }] : [])] }) },
      select: { dayOfWeek: true, startMin: true, endMin: true, section: { select: { departmentId: true } }, room: { select: { roomNumber: true, roomName: true } }, faculty: { select: { fullName: true } } },
    });
    if (!row) return { error: "Choose one of your own classes." };
    departmentId = row.section.departmentId;
    current = { room: `${row.room.roomNumber} ${row.room.roomName}`, day: day(row.dayOfWeek), time: formatRange(row.startMin, row.endMin), faculty: row.faculty.fullName };
  }
  const [room, faculty] = await Promise.all([
    d.type === "CHANGE_ROOM" && d.requestedRoomId ? prisma.room.findFirst({ where: { id: d.requestedRoomId }, select: { roomNumber: true, roomName: true } }) : null,
    d.type === "CHANGE_FACULTY" && d.requestedFacultyId ? prisma.faculty.findFirst({ where: { id: d.requestedFacultyId, status: "ACTIVE", archivedAt: null }, select: { fullName: true } }) : null,
  ]);
  if (d.type === "CHANGE_ROOM" && !room) return { error: "Choose a room that exists." };
  if (d.type === "CHANGE_FACULTY" && !faculty) return { error: "Choose an active faculty member." };

  // Only the fields that belong to the chosen type are kept.
  const form: RequestFormData = {
    ...d,
    requestedRoomId: d.type === "CHANGE_ROOM" ? d.requestedRoomId : null,
    requestedFacultyId: d.type === "CHANGE_FACULTY" ? d.requestedFacultyId : null,
    requestedDay: d.type === "CHANGE_TIME" ? d.requestedDay : null,
    requestedStart: d.type === "CHANGE_TIME" ? d.requestedStart : null,
    requestedEnd: d.type === "CHANGE_TIME" ? d.requestedEnd : null,
  };
  const requested: RequestSummary | undefined =
    d.type === "CHANGE_ROOM" ? { room: `${room!.roomNumber} ${room!.roomName}` }
    : d.type === "CHANGE_FACULTY" ? { faculty: faculty!.fullName }
    : d.type === "CHANGE_TIME" ? { day: day(d.requestedDay!), time: formatRange(minutes(d.requestedStart!), minutes(d.requestedEnd!)) }
    : undefined;
  return { departmentId, details: { reason: d.reason, form, current, requested } };
}

const label = (type: string) => TYPE_LABELS[type] ?? type.replace(/_/g, " ").toLowerCase();

export async function createRequestAction(input: RequestFormInput): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const scope = await getScope();
  const parsed = requestFormSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the request." };
  const d = parsed.data;
  const prepared = await prepare(scope, d);
  if ("error" in prepared) return { ok: false, error: prepared.error };

  const request = await prisma.scheduleRequest.create({
    data: { type: d.type, scheduleId: d.scheduleId, reason: d.reason, requestedById: scope.userId, departmentId: prepared.departmentId, details: prepared.details as never },
  });
  // Routed to the requester's own Head of Department and the Registrar only.
  await notifyManagers(scope.departmentId, {
    title: "New scheduling request submitted",
    message: `${scope.name} submitted a ${label(d.type).toLowerCase()} request.`,
    link: "/requests",
  });
  revalidatePath("/requests");
  return { ok: true, id: request.id };
}

/** The person who filed a pending class request changes it; nobody else can. */
export async function updateRequestAction(id: string, input: RequestFormInput): Promise<Result> {
  const scope = await getScope();
  const parsed = requestFormSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the request." };
  const stored = await prisma.scheduleRequest.findUnique({ where: { id }, include: { requestedBy: { select: { role: true } } } });
  const who = { role: scope.role, userId: scope.userId, departmentIds: scope.departmentIds };
  if (!stored || !canEditRequest(who, { ...stored, requesterRole: stored.requestedBy.role })) {
    if (stored) await logBlocked(scope, "edit a request that is not theirs to change", "ScheduleRequest", id);
    return { ok: false, error: "Only the Head of Department who owns a pending request can edit it." };
  }
  const prepared = await prepare(scope, parsed.data);
  if ("error" in prepared) return { ok: false, error: prepared.error };
  await prisma.scheduleRequest.update({
    where: { id },
    data: { type: parsed.data.type, scheduleId: parsed.data.scheduleId, reason: parsed.data.reason, departmentId: prepared.departmentId, details: prepared.details as never },
  });
  await prisma.auditLog.create({ data: { userId: scope.userId, role: scope.role, departmentId: prepared.departmentId, action: `Edited ${label(parsed.data.type).toLowerCase()} request`, entity: "ScheduleRequest", entityId: id } });
  if (stored.requestedById !== scope.userId) await notifyUsers([stored.requestedById], { title: "Your request was edited", message: `${scope.name} edited your ${label(parsed.data.type).toLowerCase()} request.`, link: "/requests" });
  revalidatePath("/requests");
  return { ok: true };
}

/** Withdraws a pending request; reviewers are told so they stop looking for it. */
export async function cancelRequestAction(id: string): Promise<Result> {
  const scope = await getScope();
  const request = await prisma.scheduleRequest.findUnique({ where: { id }, include: { requestedBy: { select: { role: true } } } });
  const who = { role: scope.role, userId: scope.userId, departmentIds: scope.departmentIds };
  if (!request || !canCancelRequest(who, { ...request, requesterRole: request.requestedBy.role })) {
    if (request) await logBlocked(scope, "cancel a request that is not theirs to change", "ScheduleRequest", id);
    return { ok: false, error: "Only the Head of Department who owns a pending request can cancel it." };
  }
  const res = await prisma.scheduleRequest.updateMany({ where: { id, status: "PENDING" }, data: { status: "CANCELLED" } });
  if (res.count === 0) return { ok: false, error: "This request was already reviewed." };
  await prisma.auditLog.create({ data: { userId: scope.userId, role: scope.role, departmentId: request.departmentId, action: `Cancelled ${label(request.type).toLowerCase()} request`, entity: "ScheduleRequest", entityId: id } });
  await notifyManagers(request.departmentId, { title: "Scheduling request cancelled", message: `${scope.name} cancelled a ${label(request.type).toLowerCase()} request.`, link: "/requests" });
  if (request.requestedById !== scope.userId) await notifyUsers([request.requestedById], { title: "Your request was cancelled", message: `${scope.name} cancelled your ${label(request.type).toLowerCase()} request.`, link: "/requests", type: "WARNING" });
  revalidatePath("/requests");
  return { ok: true };
}

/** A Head of Department asks the Registrar to change a faculty record of their department. */
export async function requestFacultyChangeAction(facultyId: string, changes: unknown, reason: string): Promise<Result> {
  const scope = await requireScope("HEAD_OF_DEPARTMENT");
  const faculty = await prisma.faculty.findUnique({ where: { id: facultyId }, select: { fullName: true, departmentId: true } });
  if (!faculty || faculty.departmentId !== scope.departmentId) {
    await logBlocked(scope, "request a change to a faculty record outside the department", "Faculty", facultyId);
    return { ok: false, error: "You can only request changes for your own department's faculty." };
  }
  const parsed = facultyChangeSchema.safeParse(changes);
  if (!parsed.success || Object.keys(parsed.data).length === 0) return { ok: false, error: "Change at least one field." };
  if (!reason.trim()) return { ok: false, error: "Explain why the change is needed." };
  const summary = describeChanges(parsed.data);
  const details: FacultyChangeDetails = { kind: "FACULTY_CHANGE", facultyId, facultyName: faculty.fullName, changes: parsed.data, summary };
  await prisma.scheduleRequest.create({
    data: { type: "FACULTY_CHANGE", requestedById: scope.userId, departmentId: faculty.departmentId, details: details as never, reason: `${faculty.fullName}: ${summary}. Reason: ${reason.trim()}` },
  });
  await notifyManagers(null, { title: "Faculty record change requested", message: `${scope.name} asks to change ${faculty.fullName}: ${summary}.`, link: "/requests" });
  revalidatePath("/requests");
  return { ok: true };
}

export async function reviewRequestAction(id: string, status: "APPROVED" | "REJECTED", reviewNote?: string): Promise<Result> {
  const scope = await requireScope(...STAFF_ROLES);
  const request = await prisma.scheduleRequest.findUnique({ where: { id }, include: { requestedBy: { select: { role: true } } } });
  if (!request || request.status !== "PENDING") return { ok: false, error: "This request was already reviewed." };
  if (!canReviewRequest({ role: scope.role, userId: scope.userId, departmentIds: scope.departmentIds }, { ...request, requesterRole: request.requestedBy.role })) {
    await logBlocked(scope, "review a request that is not theirs to decide", "ScheduleRequest", id);
    return { ok: false, error: "Only the Head of Department who owns this request can decide it." };
  }

  if (status === "REJECTED" && !reviewNote?.trim()) return { ok: false, error: "A rejection reason is required." };

  // Approving a cross-department or faculty change applies it at once; if it no longer fits, nothing changes.
  if (status === "APPROVED" && (request.type === "CROSS_DEPARTMENT" || request.type === "FACULTY_CHANGE")) {
    const reviewer = { userId: scope.userId, name: scope.name };
    const problem = request.type === "CROSS_DEPARTMENT" ? await applyCrossDepartment(id, reviewer) : await applyFacultyChange(id, reviewer);
    if (problem) return { ok: false, error: problem };
    await prisma.scheduleRequest.update({ where: { id }, data: { reviewNote: reviewNote || null, reviewedById: scope.userId } });
  } else {
    await prisma.scheduleRequest.update({ where: { id }, data: { status, reviewNote: reviewNote || null, reviewedById: scope.userId } });
    await notifyUsers([request.requestedById], {
      title: `Request ${status.toLowerCase()}`,
      message: `Your ${request.type.replace(/_/g, " ").toLowerCase()} request was ${status.toLowerCase()}${reviewNote ? `: ${reviewNote}` : "."}`,
      link: "/requests",
      type: status === "APPROVED" ? "SUCCESS" : "WARNING",
    });
  }
  await prisma.auditLog.create({ data: { userId: scope.userId, action: `${status === "APPROVED" ? "Approved" : "Rejected"} ${request.type.replace(/_/g, " ").toLowerCase()} request`, entity: "ScheduleRequest", entityId: id } });
  // An approved request can change who teaches what or a faculty record's limits.
  if (status === "APPROVED") queueWorkloadCheck(`A ${request.type.replace(/_/g, " ").toLowerCase()} request was approved`, scope.userId);
  revalidatePath("/requests");
  revalidatePath("/scheduler");
  revalidatePath("/faculty");
  return { ok: true };
}
