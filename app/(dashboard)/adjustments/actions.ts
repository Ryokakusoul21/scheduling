"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { queueWorkloadCheck } from "@/lib/workload/auto";
import { STAFF_ROLES } from "@/lib/permissions/roles";
import { canManageDepartment, requireScope, type Scope } from "@/lib/permissions/scope";
import {
  addMakeUp,
  applyPlan,
  findMakeUpOptions,
  planFacultyUnavailable,
  planRoomUnavailable,
  planSuspension,
  undoBatch,
  type AdjustmentPlan,
  type Placement,
} from "@/lib/occupancy/adjust";
import { notifyUsers } from "@/lib/notify";

type Result<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the dates");
const base = {
  start: DATE,
  end: DATE,
  startMin: z.number().int().min(0).max(24 * 60).nullable(),
  endMin: z.number().int().min(0).max(24 * 60).nullable(),
  reason: z.string().trim().min(3, "Give a reason").max(300),
};
const requestSchema = z
  .discriminatedUnion("kind", [
    z.object({ kind: z.literal("FACULTY"), facultyId: z.string().min(1, "Choose a faculty member"), reportId: z.string().optional(), ...base }),
    z.object({ kind: z.literal("ROOM"), roomId: z.string().min(1, "Choose a room"), ...base }),
    z.object({ kind: z.literal("SUSPENSION"), sectionIds: z.array(z.string()).max(500), title: z.string().trim().min(3, "Give the suspension a title").max(120), ...base }),
  ])
  .refine((d) => d.end >= d.start, { message: "The end date cannot be before the start date." })
  .refine((d) => (d.startMin === null) === (d.endMin === null) && (d.startMin === null || d.endMin! > d.startMin), { message: "Give both a start and an end time, or neither for whole days." })
  .refine((d) => (new Date(`${d.end}T00:00:00Z`).getTime() - new Date(`${d.start}T00:00:00Z`).getTime()) / 86400000 <= 31, { message: "Adjust at most 31 days at a time." });

export type AdjustmentRequest = z.infer<typeof requestSchema>;

/** Head of Department may only act on their own department's faculty, rooms, and sections. */
async function authorize(scope: Scope, req: AdjustmentRequest): Promise<string | null> {
  if (scope.isAdmin) return null;
  if (req.kind === "FACULTY") {
    const f = await prisma.faculty.findUnique({ where: { id: req.facultyId }, select: { departmentId: true } });
    return canManageDepartment(scope, f?.departmentId) ? null : "You can only adjust schedules of faculty in your department.";
  }
  if (req.kind === "ROOM") {
    const r = await prisma.room.findUnique({ where: { id: req.roomId }, select: { departmentId: true } });
    return canManageDepartment(scope, r?.departmentId) ? null : "You can only close rooms that belong to your department.";
  }
  if (req.sectionIds.length === 0) return "Choose the sections to suspend; only the Administrator can suspend every section.";
  const outside = await prisma.section.count({ where: { id: { in: req.sectionIds }, NOT: { program: { departmentId: scope.manageDepartmentId } } } });
  return outside ? "You can only suspend classes of sections in your department." : null;
}

function plan(req: AdjustmentRequest): Promise<AdjustmentPlan> {
  const range = { start: req.start, end: req.end, startMin: req.startMin, endMin: req.endMin };
  if (req.kind === "FACULTY") return planFacultyUnavailable(req.facultyId, range);
  if (req.kind === "ROOM") return planRoomUnavailable(req.roomId, range);
  return planSuspension(req.sectionIds, range);
}

async function checked(input: AdjustmentRequest) {
  const scope = await requireScope(...STAFF_ROLES);
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) return { scope, error: parsed.error.issues[0]?.message ?? "Check the details." } as const;
  const denied = await authorize(scope, parsed.data);
  return denied ? ({ scope, error: denied } as const) : ({ scope, req: parsed.data } as const);
}

/** Before-and-after preview; nothing is saved. */
export async function previewAdjustmentAction(input: AdjustmentRequest): Promise<Result<AdjustmentPlan>> {
  const c = await checked(input);
  if ("error" in c) return { ok: false, error: c.error! };
  return { ok: true, data: await plan(c.req) };
}

/** Regenerates the affected schedules, records why, and notifies everyone affected. */
export async function applyAdjustmentAction(input: AdjustmentRequest): Promise<Result<{ batchId: string; plan: AdjustmentPlan }>> {
  const c = await checked(input);
  if ("error" in c) return { ok: false, error: c.error! };
  const { scope, req } = c;
  const p = await plan(req);
  if (p.blockers.length) return { ok: false, error: p.blockers.join(" ") };

  const dates = req.start === req.end ? req.start : `${req.start} to ${req.end}`;
  const cause = req.kind === "FACULTY" ? "FACULTY_UNAVAILABLE" : req.kind === "ROOM" ? "ROOM_UNAVAILABLE" : "CLASS_SUSPENSION";
  const subject =
    req.kind === "FACULTY" ? (await prisma.faculty.findUnique({ where: { id: req.facultyId }, select: { fullName: true } }))?.fullName
    : req.kind === "ROOM" ? (await prisma.room.findUnique({ where: { id: req.roomId }, select: { roomName: true } }))?.roomName
    : req.title;
  const summary = `${req.kind === "SUSPENSION" ? "Class suspension" : `${subject} unavailable`} (${dates}): ${req.reason}`;
  const batchId = await applyPlan(p, cause, summary, scope.userId);

  const when = { startDate: new Date(`${req.start}T00:00:00Z`), endDate: new Date(`${req.end}T00:00:00Z`), startMin: req.startMin, endMin: req.endMin };
  if (req.kind === "SUSPENSION") {
    await prisma.activity.create({ data: { type: "CLASS_SUSPENSION", title: req.title, description: req.reason, sectionIds: req.sectionIds, batchId, createdById: scope.userId, ...when } });
  } else if (req.kind === "FACULTY" && req.reportId) {
    const report = await prisma.unavailability.update({ where: { id: req.reportId }, data: { status: "APPLIED", batchId, ...when } });
    if (report.reportedById) await notifyUsers([report.reportedById], { title: "Unavailability report applied", message: `Your classes for ${dates} were reassigned or cancelled for make-up.`, link: "/availability" });
  } else {
    await prisma.unavailability.create({
      data: { kind: req.kind, facultyId: req.kind === "FACULTY" ? req.facultyId : null, roomId: req.kind === "ROOM" ? req.roomId : null, reason: req.reason, status: "APPLIED", reportedById: scope.userId, batchId, ...when },
    });
  }
  await prisma.auditLog.create({ data: { userId: scope.userId, action: `Applied schedule adjustment: ${summary}`, entity: "AdjustmentBatch", entityId: batchId, newValue: { affected: p.items.length } } });
  revalidate();
  queueWorkloadCheck("A schedule adjustment was applied");
  return { ok: true, data: { batchId, plan: p } };
}

async function batchScope(batchId: string) {
  const scope = await requireScope(...STAFF_ROLES);
  const batch = await prisma.adjustmentBatch.findUnique({
    where: { id: batchId },
    include: { activity: true, unavailability: true, booking: true, adjustments: { select: { schedule: { select: { section: { select: { program: { select: { departmentId: true } } } } } } } } },
  });
  if (!batch) return { error: "This change no longer exists." } as const;
  const allowed = scope.isAdmin || batch.createdById === scope.userId || batch.adjustments.every((a) => canManageDepartment(scope, a.schedule.section.program?.departmentId));
  return allowed ? ({ scope, batch } as const) : ({ error: "You can only manage changes in your department." } as const);
}

/** Undoes a whole adjustment: classes return to their original slots and the suspension or closure is lifted. */
export async function undoAdjustmentAction(batchId: string): Promise<Result> {
  const b = await batchScope(batchId);
  if ("error" in b) return { ok: false, error: b.error! };
  const { scope, batch } = b;
  const problem = await undoBatch(batchId, batch.booking ? [batch.booking.id] : []);
  if (problem) return { ok: false, error: problem };
  if (batch.activity) await prisma.activity.delete({ where: { id: batch.activity.id } });
  if (batch.booking) await prisma.roomBooking.update({ where: { id: batch.booking.id }, data: { status: "CANCELLED" } });
  if (batch.unavailability) {
    // Reports from faculty go back to pending; closures entered here are removed.
    const u = batch.unavailability;
    if (u.reportedById && u.reportedById !== batch.createdById) await prisma.unavailability.update({ where: { id: u.id }, data: { status: "PENDING", batchId: null } });
    else await prisma.unavailability.delete({ where: { id: u.id } });
  }
  await prisma.auditLog.create({ data: { userId: scope.userId, action: `Undid schedule adjustment: ${batch.summary}`, entity: "AdjustmentBatch", entityId: batchId } });
  revalidate();
  queueWorkloadCheck("A schedule adjustment was undone");
  return { ok: true, data: undefined };
}

/** Last date affected by the batch, so make-up options start after it. */
function batchEnd(batch: { activity: { endDate: Date } | null; unavailability: { endDate: Date } | null }, fallback: string) {
  const end = batch.activity?.endDate ?? batch.unavailability?.endDate;
  return end ? end.toISOString().slice(0, 10) : fallback;
}

export async function makeUpOptionsAction(batchId: string, scheduleId: string, date: string): Promise<Result<(Placement & { reason: string })[]>> {
  const b = await batchScope(batchId);
  if ("error" in b) return { ok: false, error: b.error! };
  return { ok: true, data: await findMakeUpOptions(scheduleId, date, batchEnd(b.batch, date)) };
}

const choiceSchema = z.object({ date: DATE, roomId: z.string().min(1), startMin: z.number().int(), endMin: z.number().int() });

export async function scheduleMakeUpAction(batchId: string, scheduleId: string, date: string, choice: z.infer<typeof choiceSchema>): Promise<Result> {
  const b = await batchScope(batchId);
  if ("error" in b) return { ok: false, error: b.error! };
  const parsed = choiceSchema.safeParse(choice);
  if (!parsed.success) return { ok: false, error: "Invalid make-up option." };
  const already = await prisma.scheduleAdjustment.count({ where: { batchId, scheduleId, date: new Date(`${date}T00:00:00Z`), kind: "MAKE_UP" } });
  if (already) return { ok: false, error: "A make-up class is already scheduled for this meeting." };
  const problem = await addMakeUp(batchId, scheduleId, date, parsed.data);
  if (problem) return { ok: false, error: problem };
  await prisma.auditLog.create({ data: { userId: b.scope.userId, action: "Scheduled make-up class", entity: "AdjustmentBatch", entityId: batchId, newValue: { scheduleId, originalDate: date, ...parsed.data } } });
  revalidate();
  queueWorkloadCheck("A make-up class was scheduled");
  return { ok: true, data: undefined };
}

export async function dismissReportAction(id: string): Promise<Result> {
  const scope = await requireScope(...STAFF_ROLES);
  const report = await prisma.unavailability.findUnique({ where: { id }, include: { faculty: { select: { departmentId: true } } } });
  if (!report || report.status !== "PENDING") return { ok: false, error: "This report was already handled." };
  if (!canManageDepartment(scope, report.faculty?.departmentId)) return { ok: false, error: "You can only handle reports from your department." };
  await prisma.unavailability.update({ where: { id }, data: { status: "DISMISSED" } });
  if (report.reportedById) await notifyUsers([report.reportedById], { title: "Unavailability report dismissed", message: "Your report was reviewed and dismissed. Your classes stay as scheduled.", link: "/availability" });
  revalidate();
  return { ok: true, data: undefined };
}

function revalidate() {
  revalidatePath("/adjustments");
  revalidatePath("/calendar");
  revalidatePath("/availability");
}
