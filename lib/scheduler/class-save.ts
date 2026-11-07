import "server-only";
import { revalidatePath } from "next/cache";
import type { ScheduleStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { queueWorkloadCheck } from "@/lib/workload/auto";
import { DIRECT_EDIT_ROLES, PUBLISH_ROLES, type AppRole } from "@/lib/permissions/roles";
import { weeklyDoubleBooking } from "./term-conflicts";
import { dayOfWeek, isoDate } from "@/lib/occupancy/engine";
import { formatRange } from "./timetable";
import { checkClassConstraints } from "./constraints-server";
import type { Violation } from "./constraints";
import type { SchedulerEntry } from "@/components/scheduler/types";

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
  revalidatePath("/scheduler");
  revalidatePath("/dashboard");
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
    prisma.section.findUnique({ where: { id: d.sectionId }, select: { id: true, archivedAt: true } }),
    prisma.subject.findUnique({ where: { id: d.subjectId }, select: { id: true, archivedAt: true } }),
    prisma.faculty.findUnique({ where: { id: d.facultyId }, select: { id: true, archivedAt: true } }),
    prisma.room.findUnique({ where: { id: d.roomId }, select: { id: true, archivedAt: true } }),
    prisma.semester.findUnique({ where: { id: d.semesterId }, select: { id: true } }),
  ]);
  if (!section || !subject || !faculty || !room || !term) {
    return { ok: false as const, error: "The section, subject, faculty, room, or term no longer exists. Refresh and try again." };
  }
  // Archived records may stay on an existing class but can never be newly assigned.
  const before = d.id ? await prisma.schedule.findUnique({ where: { id: d.id }, select: { sectionId: true, subjectId: true, facultyId: true, roomId: true } }) : null;
  if (d.id && !before) return { ok: false as const, error: "This class was deleted by someone else." };
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
export async function writeClass(d: ClassData, actor: { userId: string; role: AppRole }, action: string): Promise<SaveResult> {
  const { id, status, notes, ...data } = d;
  const owner = await prisma.section.findUnique({ where: { id: data.sectionId }, select: { departmentId: true } });
  if (!owner) return { ok: false, error: "Choose an existing section." };
  const existing = id ? await prisma.schedule.findUnique({ where: { id }, select: { status: true } }) : null;
  if (id && !existing) return { ok: false, error: "This class was deleted by someone else." };
  const saved = id
    ? await prisma.schedule.update({ where: { id }, data: { ...data, departmentId: owner.departmentId, notes: notes || null, status: resolveStatus(actor.role, status, existing!.status) } })
    : await prisma.schedule.create({ data: { ...data, departmentId: owner.departmentId, notes: notes || null, status: resolveStatus(actor.role, status, undefined), generatedBy: actor.userId } });
  await prisma.auditLog.create({ data: { userId: actor.userId, action, entity: "Schedule", entityId: saved.id, newValue: data } });
  revalidateScheduler();
  queueWorkloadCheck(id ? "A class was edited or reassigned" : "A class was added");
  return { ok: true, data: toEntry(saved) };
}
