"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import type { ScheduleStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { queueWorkloadCheck } from "@/lib/workload/auto";
import { DIRECT_EDIT_ROLES, PUBLISH_ROLES, STAFF_ROLES, type AppRole } from "@/lib/permissions/roles";
import { canManageDepartment, requireScope, type Scope } from "@/lib/permissions/scope";
import { weeklyDoubleBooking } from "@/lib/scheduler/term-conflicts";
import { checkClassConstraints, termConstraintReport } from "@/lib/scheduler/constraints-server";
import type { Violation } from "@/lib/scheduler/constraints";
import type { SchedulerEntry } from "@/components/scheduler/types";

type Result<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

/** Save result that may carry constraint violations; overridable means only soft rules were broken. */
type SaveResult = { ok: true; data: SchedulerEntry } | { ok: false; error: string; violations?: Violation[]; overridable?: boolean };

const DAY = z.enum(["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"]);
const STATUS = z.enum(["DRAFT", "REVIEW", "PUBLISHED", "ARCHIVED"]);

const classSchema = z
  .object({
    id: z.string().optional(),
    semesterId: z.string().min(1, "Choose a term"),
    sectionId: z.string().min(1, "Choose a section"),
    subjectId: z.string().min(1, "Choose a subject"),
    facultyId: z.string().min(1, "Choose a faculty member"),
    roomId: z.string().min(1, "Choose a room"),
    component: z.enum(["LECTURE", "LABORATORY"]),
    dayOfWeek: DAY,
    startMin: z.number().int().min(0).max(24 * 60),
    endMin: z.number().int().min(0).max(24 * 60),
    status: STATUS.optional(),
    notes: z.string().max(500).optional(),
  })
  .refine((d) => d.endMin > d.startMin, { message: "End time must be after start time", path: ["endMin"] });

export type ClassInput = z.infer<typeof classSchema>;

function toEntry(s: {
  id: string;
  semesterId: string;
  sectionId: string;
  subjectId: string;
  facultyId: string;
  roomId: string;
  component: "LECTURE" | "LABORATORY";
  dayOfWeek: SchedulerEntry["dayOfWeek"];
  startMin: number;
  endMin: number;
  status: ScheduleStatus;
  notes: string | null;
}): SchedulerEntry {
  return {
    id: s.id,
    semesterId: s.semesterId,
    sectionId: s.sectionId,
    subjectId: s.subjectId,
    facultyId: s.facultyId,
    roomId: s.roomId,
    component: s.component,
    dayOfWeek: s.dayOfWeek,
    startMin: s.startMin,
    endMin: s.endMin,
    status: s.status,
    notes: s.notes,
  };
}

/**
 * Status after an edit. Administrator edits apply directly (no approval). A Head of
 * Department's new classes start as drafts and a change to a published class goes back to
 * review until it is approved and published.
 */
function resolveStatus(role: AppRole, requested: ScheduleStatus | undefined, previous: ScheduleStatus | undefined) {
  const direct = DIRECT_EDIT_ROLES.includes(role);
  const canPublish = PUBLISH_ROLES.includes(role);
  if (direct) return requested ?? previous ?? "PUBLISHED";
  let next = requested ?? (previous === "PUBLISHED" ? "REVIEW" : previous ?? "DRAFT");
  if (next === "PUBLISHED" && !canPublish) next = "REVIEW";
  return next;
}

/** Head of Department may only change classes of sections in their own department. */
async function sectionAllowed(scope: Scope, sectionId: string) {
  const section = await prisma.section.findUnique({ where: { id: sectionId }, select: { program: { select: { departmentId: true } } } });
  return canManageDepartment(scope, section?.program?.departmentId);
}

const OUTSIDE_DEPARTMENT = "You can only change classes of sections in your own department.";

/** Hard violations always block; soft ones block until the user chooses to override. */
async function enforceConstraints(
  entry: Parameters<typeof checkClassConstraints>[0],
  excludeId: string | undefined,
  overrideSoft: boolean,
  userId: string
): Promise<Extract<SaveResult, { ok: false }> | null> {
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

function revalidate() {
  revalidatePath("/scheduler");
  revalidatePath("/dashboard");
}

export async function saveClassAction(input: ClassInput, overrideSoft = false): Promise<SaveResult> {
  const scope = await requireScope(...STAFF_ROLES);
  const user = { id: scope.userId, role: scope.role };
  const parsed = classSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid class details." };
  const { id, status, notes, ...data } = parsed.data;

  const [section, subject, faculty, room, term] = await Promise.all([
    prisma.section.findUnique({ where: { id: data.sectionId }, select: { id: true, archivedAt: true } }),
    prisma.subject.findUnique({ where: { id: data.subjectId }, select: { id: true, archivedAt: true } }),
    prisma.faculty.findUnique({ where: { id: data.facultyId }, select: { id: true, archivedAt: true } }),
    prisma.room.findUnique({ where: { id: data.roomId }, select: { id: true, archivedAt: true } }),
    prisma.semester.findUnique({ where: { id: data.semesterId }, select: { id: true } }),
  ]);
  if (!section || !subject || !faculty || !room || !term) {
    return { ok: false, error: "The section, subject, faculty, room, or term no longer exists. Refresh and try again." };
  }
  // Archived records may stay on an existing class but can never be newly assigned.
  const before = id ? await prisma.schedule.findUnique({ where: { id }, select: { sectionId: true, subjectId: true, facultyId: true, roomId: true } }) : null;
  const archived = [
    { label: "section", row: section, prev: before?.sectionId },
    { label: "subject", row: subject, prev: before?.subjectId },
    { label: "faculty member", row: faculty, prev: before?.facultyId },
    { label: "room", row: room, prev: before?.roomId },
  ].find((p) => p.row.archivedAt && p.row.id !== p.prev);
  if (archived) return { ok: false, error: `That ${archived.label} is archived. Restore it in User Management or choose another.` };
  if (!(await sectionAllowed(scope, data.sectionId))) return { ok: false, error: OUTSIDE_DEPARTMENT };
  const clash = await weeklyDoubleBooking(data, id);
  if (clash) return { ok: false, error: clash };
  const blocked = await enforceConstraints(data, id, overrideSoft, user.id);
  if (blocked) return blocked;

  const role = user.role as AppRole;
  if (id) {
    const existing = await prisma.schedule.findUnique({ where: { id }, select: { status: true } });
    if (!existing) return { ok: false, error: "This class was deleted by someone else." };
    const saved = await prisma.schedule.update({
      where: { id },
      data: { ...data, notes: notes || null, status: resolveStatus(role, status, existing.status) },
    });
    await prisma.auditLog.create({
      data: { userId: user.id, action: "Edited class schedule", entity: "Schedule", entityId: id, newValue: data },
    });
    revalidate();
    queueWorkloadCheck("A class was edited or reassigned");
    return { ok: true, data: toEntry(saved) };
  }

  const created = await prisma.schedule.create({
    data: { ...data, notes: notes || null, status: resolveStatus(role, status, undefined), generatedBy: user.id },
  });
  await prisma.auditLog.create({
    data: { userId: user.id, action: "Created class schedule", entity: "Schedule", entityId: created.id, newValue: data },
  });
  revalidate();
  queueWorkloadCheck("A class was added");
  return { ok: true, data: toEntry(created) };
}

const moveSchema = z
  .object({
    id: z.string().min(1),
    dayOfWeek: DAY,
    startMin: z.number().int().min(0),
    endMin: z.number().int().max(24 * 60),
  })
  .refine((d) => d.endMin > d.startMin);

/** Drag-and-drop move: changes only the day and time. */
export async function moveClassAction(input: z.infer<typeof moveSchema>, overrideSoft = false): Promise<SaveResult> {
  const scope = await requireScope(...STAFF_ROLES);
  const user = { id: scope.userId, role: scope.role };
  const parsed = moveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid move." };
  const { id, ...slot } = parsed.data;

  const existing = await prisma.schedule.findUnique({ where: { id } });
  if (!existing) return { ok: false, error: "This class was deleted by someone else." };
  if (!(await sectionAllowed(scope, existing.sectionId))) return { ok: false, error: OUTSIDE_DEPARTMENT };
  const clash = await weeklyDoubleBooking({ ...existing, ...slot }, id);
  if (clash) return { ok: false, error: clash };
  const blocked = await enforceConstraints({ ...existing, ...slot }, id, overrideSoft, user.id);
  if (blocked) return blocked;

  const saved = await prisma.schedule.update({
    where: { id },
    data: { ...slot, status: resolveStatus(user.role as AppRole, undefined, existing.status) },
  });
  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "Moved class (drag and drop)",
      entity: "Schedule",
      entityId: id,
      oldValue: { dayOfWeek: existing.dayOfWeek, startMin: existing.startMin, endMin: existing.endMin },
      newValue: slot,
    },
  });
  revalidate();
  queueWorkloadCheck("A class was moved");
  return { ok: true, data: toEntry(saved) };
}

export async function deleteClassAction(id: string): Promise<Result> {
  const scope = await requireScope(...STAFF_ROLES);
  const user = { id: scope.userId };
  const existing = await prisma.schedule.findUnique({ where: { id } });
  if (!existing) return { ok: true, data: undefined };
  if (!(await sectionAllowed(scope, existing.sectionId))) return { ok: false, error: OUTSIDE_DEPARTMENT };
  await prisma.$transaction([
    prisma.scheduleRequest.updateMany({ where: { scheduleId: id }, data: { scheduleId: null } }),
    prisma.schedule.delete({ where: { id } }),
  ]);
  await prisma.auditLog.create({
    data: { userId: user.id, action: "Deleted class schedule", entity: "Schedule", entityId: id, oldValue: existing },
  });
  revalidate();
  queueWorkloadCheck("A class was removed");
  return { ok: true, data: undefined };
}

/** Bulk publish (e.g. everything visible in the current filter). */
export async function publishClassesAction(ids: string[]): Promise<Result<{ count: number }>> {
  const scope = await requireScope(...PUBLISH_ROLES);
  const user = { id: scope.userId };
  const parsed = z.array(z.string().min(1)).max(2000).safeParse(ids);
  if (!parsed.success) return { ok: false, error: "Invalid selection." };
  // A Head of Department approves and publishes only their own department's classes.
  const departmentFilter = scope.isAdmin ? {} : { section: { program: { departmentId: scope.manageDepartmentId } } };
  const { count } = await prisma.schedule.updateMany({
    where: { id: { in: parsed.data }, status: { in: ["DRAFT", "REVIEW"] }, ...departmentFilter },
    data: { status: "PUBLISHED" },
  });
  await prisma.auditLog.create({
    data: { userId: user.id, action: `Published ${count} class schedule(s)`, entity: "Schedule" },
  });
  revalidate();
  return { ok: true, data: { count } };
}

/** Constraint report for a term; a Head of Department only sees findings involving their department. */
export async function constraintReportAction(termId: string): Promise<Result<Violation[]>> {
  const scope = await requireScope(...STAFF_ROLES);
  if (!termId) return { ok: false, error: "Choose a term first." };
  return { ok: true, data: await termConstraintReport(termId, scope.manageDepartmentId) };
}
