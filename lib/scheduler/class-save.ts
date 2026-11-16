import { roomAllowsSection } from "@/lib/rooms/designation";
import { getTimetableConfig } from "@/lib/timetable/service";
import { timetableTimeError } from "@/lib/timetable/config";
import "server-only";
import { revalidatePath } from "next/cache";
import type { Prisma, ScheduleStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { queueWorkloadCheck } from "@/lib/workload/auto";
import { DIRECT_EDIT_ROLES, PUBLISH_ROLES, type AppRole } from "@/lib/permissions/roles";
import { concurrentTermIds, weeklyDoubleBooking } from "./term-conflicts";
import { dayOfWeek, isoDate } from "@/lib/occupancy/engine";
import { collegeLengthError, formatRange } from "./timetable";
import { checkClassConstraints } from "./constraints-server";
import type { Violation } from "./constraints";
import type { SchedulerEntry } from "@/components/scheduler/types";
import { notifyUsers } from "@/lib/notify";

/** Save result; overridable means only soft rules were broken; requested means it went to another department for approval. */
export type SaveResult =
  | { ok: true; data: SchedulerEntry }
  | { ok: false; error: string; violations?: Violation[]; overridable?: boolean; requested?: boolean };

/** A class as saved: placement plus optional id (edit), status, and notes. */
export interface ClassData {
  id?: string;
  semesterId: string;
  sectionId: string;
  subjectId: string;
  facultyId: string;
  roomId: string;
  component: "LECTURE" | "LABORATORY";
  dayOfWeek: SchedulerEntry["dayOfWeek"];
  startMin: number;
  endMin: number;
  status?: ScheduleStatus;
  notes?: string;
  doNotMove?: boolean;
}

export function toEntry(s: Omit<SchedulerEntry, "notes"> & { notes: string | null }): SchedulerEntry {
  return {
    id: s.id, semesterId: s.semesterId, sectionId: s.sectionId, subjectId: s.subjectId, facultyId: s.facultyId, roomId: s.roomId,
    component: s.component, dayOfWeek: s.dayOfWeek, startMin: s.startMin, endMin: s.endMin, status: s.status, notes: s.notes, doNotMove: s.doNotMove,
  };
}

/**
 * Status after an edit. Registrar edits apply directly (no approval). A Head of
 * Department's new classes start as drafts and a change to a published class goes back to
 * review until it is approved and published.
 */
export function resolveStatus(role: AppRole, requested: ScheduleStatus | undefined, previous: ScheduleStatus | undefined) {
  const direct = DIRECT_EDIT_ROLES.includes(role);
  const canPublish = PUBLISH_ROLES.includes(role);
  if (direct) return requested ?? previous ?? "PUBLISHED";
  let next = requested ?? (previous === "PUBLISHED" ? "REVIEW" : previous ?? "DRAFT");
  if (next === "PUBLISHED" && !canPublish) next = "REVIEW";
  return next;
}

/** Hard violations always block; soft ones block until the user chooses to override. */
async function enforceConstraints(entry: Parameters<typeof checkClassConstraints>[0], excludeId: string | undefined, overrideSoft: boolean, userId: string): Promise<Extract<SaveResult, { ok: false }> | null> {
  const violations = await checkClassConstraints(entry, excludeId);
  const hard = violations.filter((v) => v.hard);
  if (hard.length) return { ok: false, error: `${hard[0].constraintName}: ${hard[0].message}`, violations: hard };
  if (!violations.length) return null;
  if (!overrideSoft) return { ok: false, error: "This change breaks soft constraints.", violations, overridable: true };
  await prisma.auditLog.create({
    data: { userId, action: "Overrode soft scheduling constraints", entity: "Schedule", entityId: excludeId, newValue: violations.map((v) => `${v.constraintName}: ${v.message}`) },
  });
  return null;
}

export function revalidateScheduler() {
  for (const path of ["/scheduler", "/dashboard", "/subjects", "/sections", "/workload", "/my-subjects", "/analytics"]) revalidatePath(path);
}

/**
 * Upcoming confirmed room bookings that fall on this class's weekday, time, and room within its term. Dates
 * where the class was already moved (for example by an urgent booking) do not count.
 */
async function bookingClash(d: ClassData) {
  const term = await prisma.semester.findUnique({ where: { id: d.semesterId }, select: { startDate: true, endDate: true } });
  if (!term) return null;
  const today = new Date(`${new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" })}T00:00:00Z`);
  const [bookings, moved] = await Promise.all([
    prisma.roomBooking.findMany({
      where: { roomId: d.roomId, status: "CONFIRMED", date: { gte: term.startDate > today ? term.startDate : today, lte: term.endDate }, startMin: { lt: d.endMin }, endMin: { gt: d.startMin } },
      select: { date: true, startMin: true, endMin: true, purpose: true },
      orderBy: { date: "asc" },
    }),
    d.id ? prisma.scheduleAdjustment.findMany({ where: { scheduleId: d.id, batch: { undoneAt: null } }, select: { date: true } }) : Promise.resolve([]),
  ]);
  const skip = new Set(moved.map((m) => isoDate(m.date)));
  const hits = bookings.filter((b) => dayOfWeek(isoDate(b.date)) === d.dayOfWeek && !skip.has(isoDate(b.date)));
  if (!hits.length) return null;
  const first = hits[0];
  return `The room is booked on ${isoDate(first.date)}, ${formatRange(first.startMin, first.endMin)} for "${first.purpose}"${hits.length > 1 ? ` and ${hits.length - 1} more date(s)` : ""}. Choose another room or time, or ask the booker to move.`;
}

/** Every check a class must pass before it is written: archived records, double booking, constraints. */
export async function checkClass(d: ClassData, actor: { userId: string }, opts: { overrideSoft: boolean; viewerDepartmentId?: string | null }) {
  const [section, subject, faculty, room, term] = await Promise.all([
    prisma.section.findUnique({ where: { id: d.sectionId }, select: { id: true, archivedAt: true, departmentId: true, level: true } }),
    prisma.subject.findUnique({ where: { id: d.subjectId }, select: { id: true, archivedAt: true, lectureHours: true, labHours: true, level: true } }),
    prisma.faculty.findUnique({ where: { id: d.facultyId }, select: { id: true, archivedAt: true, teachingLevels: true } }),
    prisma.room.findUnique({ where: { id: d.roomId }, select: { id: true, archivedAt: true, isGeneralShared: true, departmentId: true, department: { select: { code: true } } } }),
    prisma.semester.findUnique({ where: { id: d.semesterId }, select: { id: true, level: true } }),
  ]);
  if (!section || !subject || !faculty || !room || !term) {
    return { ok: false as const, error: "The section, subject, faculty, room, or term no longer exists. Refresh and try again." };
  }
  if (!roomAllowsSection({ ...room, departmentCode: room.department?.code }, section)) {
    return { ok: false as const, error: "This room is designated for another department. Choose a General / Shared room or your department\'s room." };
  }
  // Academic levels are never mixed: section, subject, and term must share one level.
  if (subject.level !== section.level || term.level !== section.level) {
    return { ok: false as const, error: "The section, subject, and term must belong to the same academic level." };
  }
  // Archived records may stay on an existing class but can never be newly assigned.
  const before = d.id ? await prisma.schedule.findUnique({ where: { id: d.id }, select: { sectionId: true, subjectId: true, facultyId: true, roomId: true, component: true, semesterId: true, dayOfWeek: true, startMin: true, endMin: true } }) : null;
  if (d.id && !before) return { ok: false as const, error: "This class was deleted by someone else." };
  // A faculty member can only be newly assigned to a level they teach; existing classes stay editable.
  if ((!before || before.facultyId !== d.facultyId || before.sectionId !== d.sectionId) && !faculty.teachingLevels.includes(section.level)) {
    return { ok: false as const, error: "This faculty member does not teach this academic level. Update their teaching levels first." };
  }
  const timeChanged = !before || before.sectionId !== d.sectionId || before.semesterId !== d.semesterId || before.dayOfWeek !== d.dayOfWeek || before.startMin !== d.startMin || before.endMin !== d.endMin;
  if (timeChanged) {
    const error = timetableTimeError(await getTimetableConfig(d.semesterId, section.departmentId), d);
    if (error) return { ok: false as const, error };
  }
  if (timeChanged || before?.subjectId !== d.subjectId || before?.component !== d.component) {
    const required = Math.round((d.component === "LECTURE" ? subject.lectureHours : subject.labHours) * 60);
    const meetings = await prisma.schedule.findMany({ where: { semesterId: d.semesterId, sectionId: d.sectionId, subjectId: d.subjectId, component: d.component, status: { not: "ARCHIVED" }, ...(d.id ? { id: { not: d.id } } : {}) }, select: { startMin: true, endMin: true } });
    const others = meetings.reduce((sum, e) => sum + e.endMin - e.startMin, 0);
    const total = others + d.endMin - d.startMin;
    // Only a new class or a changed length is held to the College meeting length; older classes can still move.
    const lengthChanged = !before || before.endMin - before.startMin !== d.endMin - d.startMin || before.subjectId !== d.subjectId || before.component !== d.component;
    const lengthError = lengthChanged ? collegeLengthError(section.level, d.endMin - d.startMin, required - others, (await getTimetableConfig(d.semesterId, section.departmentId)).classSession) : null;
    if (lengthError) return { ok: false as const, error: lengthError };
    if (required <= 0 || total > required) return { ok: false as const, error: `This placement would exceed the required ${required / 60} weekly hours for this subject component.` };
  }
  const archived = [
    { label: "section", row: section, prev: before?.sectionId },
    { label: "subject", row: subject, prev: before?.subjectId },
    { label: "faculty member", row: faculty, prev: before?.facultyId },
    { label: "room", row: room, prev: before?.roomId },
  ].find((p) => p.row.archivedAt && p.row.id !== p.prev);
  if (archived) return { ok: false as const, error: `That ${archived.label} is archived. Restore it in User Management or choose another.` };
  const clash = (await weeklyDoubleBooking(d, d.id, opts.viewerDepartmentId)) ?? (await bookingClash(d));
  if (clash) return { ok: false as const, error: clash };
  return enforceConstraints(d, d.id, opts.overrideSoft, actor.userId);
}

/** Writes a class that already passed checkClass and records it in the audit log. */
class QueuePlacementChanged extends Error {}

/** Manual placements and Auto-Schedule share the same lock and re-check remaining hours before inserting. */
async function createQueuedClass(data: Prisma.ScheduleUncheckedCreateInput) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(90812026)`;
    const [need, teacher] = await Promise.all([
      tx.sectionClassPlaceholder.findFirst({ where: { sectionId: data.sectionId, subjectId: data.subjectId, component: data.component, section: { semesterId: data.semesterId, archivedAt: null }, subject: { archivedAt: null } }, select: { subject: { select: { lectureHours: true, labHours: true } } } }),
      tx.subjectAssignment.findFirst({ where: { sectionId: data.sectionId, subjectId: data.subjectId, semesterId: data.semesterId, status: "ACTIVE", faculty: { status: "ACTIVE", archivedAt: null } }, select: { facultyId: true } }),
    ]);
    if (!need || teacher?.facultyId !== data.facultyId) throw new QueuePlacementChanged("The queue or assigned teacher changed. Refresh Unscheduled before placing this class.");
    const required = Math.round((data.component === "LECTURE" ? need.subject.lectureHours : need.subject.labHours) * 60);
    const meetings = await tx.schedule.findMany({ where: { sectionId: data.sectionId, subjectId: data.subjectId, component: data.component, semesterId: data.semesterId, status: { not: "ARCHIVED" } }, select: { startMin: true, endMin: true } });
    const plotted = meetings.reduce((sum, e) => sum + Math.max(0, e.endMin - e.startMin), 0);
    if (plotted + data.endMin - data.startMin > required) throw new QueuePlacementChanged("The remaining hours changed. Refresh Unscheduled to avoid duplicate meetings.");
    const terms = await concurrentTermIds(data.semesterId, tx);
    const overlap = await tx.schedule.findFirst({ where: { semesterId: { in: terms }, status: { not: "ARCHIVED" }, dayOfWeek: data.dayOfWeek, startMin: { lt: data.endMin }, endMin: { gt: data.startMin }, OR: [{ sectionId: data.sectionId }, { facultyId: data.facultyId }, { roomId: data.roomId }] }, select: { id: true } });
    if (overlap) throw new QueuePlacementChanged("The teacher, room, or section was booked while placing this class. Choose another time.");
    return tx.schedule.create({ data });
  }, { maxWait: 10_000, timeout: 60_000, isolationLevel: "Serializable" });
}

export async function writeClass(d: ClassData, actor: { userId: string; role: AppRole }, action: string, changeReason?: string): Promise<SaveResult> {
  if (actor.role === "SUPER_ADMINISTRATOR") return { ok: false, error: "The Super Administrator cannot edit class schedules. Contact the Registrar." };
  const { id, status, notes } = d;
  // Persist placement columns explicitly; request provenance must never become a database field.
  const data = {
    semesterId: d.semesterId, sectionId: d.sectionId, subjectId: d.subjectId, facultyId: d.facultyId,
    roomId: d.roomId, component: d.component, dayOfWeek: d.dayOfWeek, startMin: d.startMin, endMin: d.endMin,
    doNotMove: d.doNotMove,
  };
  const owner = await prisma.section.findUnique({ where: { id: data.sectionId }, select: { departmentId: true } });
  if (!owner) return { ok: false, error: "Choose an existing section." };
  const existing = id ? await prisma.schedule.findUnique({ where: { id }, select: { status: true, facultyId: true, sectionId: true, departmentId: true, submissionId: true, subjectId: true, roomId: true, dayOfWeek: true, startMin: true, endMin: true } }) : null;
  if (id && !existing) return { ok: false, error: "This class was deleted by someone else." };
  if ((existing?.status === "PUBLISHED" || existing?.status === "REVIEW") && !changeReason?.trim()) {
    return { ok: false, error: "Document a reason before changing a previously submitted class." };
  }
  if (actor.role !== "REGISTRAR" && existing?.status === "PUBLISHED") {
    return { ok: false, error: "Published schedules are locked. Ask the Registrar to record a documented change." };
  }
  if (existing?.status === "REVIEW") return { ok: false, error: "This schedule is waiting for the Registrar's decision." };
  if (actor.role === "REGISTRAR" && (!existing || existing.status !== "PUBLISHED")) {
    return { ok: false, error: "The Registrar may correct published classes. New or draft schedules must be submitted by the department." };
  }
  let saved;
  try { saved = id
    ? await prisma.schedule.update({ where: { id }, data: { ...data, departmentId: owner.departmentId, notes: notes || null, status: actor.role === "REGISTRAR" && existing!.status === "PUBLISHED" ? "PUBLISHED" : resolveStatus(actor.role, status, existing!.status) } })
    : await createQueuedClass({ ...data, departmentId: owner.departmentId, notes: notes || null, status: resolveStatus(actor.role, status, undefined), generatedBy: actor.userId });
  } catch (error) {
    if (error instanceof QueuePlacementChanged) return { ok: false, error: error.message };
    if (error && typeof error === "object" && "code" in error && error.code === "P2034") return { ok: false, error: "The timetable changed while placing this class. Refresh Unscheduled and try again." };
    throw error;
  }
  await prisma.auditLog.create({
    data: {
      userId: actor.userId,
      action,
      entity: "Schedule",
      entityId: saved.id,
      ...(existing ? { oldValue: existing } : {}),
      newValue: data,
      ...(changeReason?.trim() ? { reason: changeReason.trim() } : {}),
    },
  });
  if (actor.role === "REGISTRAR" && existing?.status === "PUBLISHED") {
    const departmentIds = [...new Set([existing.departmentId, saved.departmentId].filter((value): value is string => !!value))];
    const [faculty, students, heads] = await Promise.all([
      prisma.user.findMany({ where: { facultyId: { in: [...new Set([existing.facultyId, saved.facultyId])] }, status: "ACTIVE", archivedAt: null }, select: { id: true } }),
      prisma.student.findMany({ where: { sectionId: { in: [...new Set([existing.sectionId, saved.sectionId])] }, user: { status: "ACTIVE", archivedAt: null } }, select: { userId: true } }),
      prisma.user.findMany({ where: { role: "HEAD_OF_DEPARTMENT", status: "ACTIVE", archivedAt: null, faculty: { departmentId: { in: departmentIds } } }, select: { id: true } }),
    ]);
    await notifyUsers([...new Set([...faculty.map((user) => user.id), ...students.map((student) => student.userId), ...heads.map((head) => head.id)])].filter((userId) => userId !== actor.userId), {
      title: "Published class schedule changed",
      message: `The Registrar changed a published class schedule. Reason: ${changeReason!.trim()}`,
      link: "/scheduler",
      type: "WARNING",
    });
  }
  revalidateScheduler();
  queueWorkloadCheck(id ? "A class was edited or reassigned" : "A class was added");
  return { ok: true, data: toEntry(saved) };
}
