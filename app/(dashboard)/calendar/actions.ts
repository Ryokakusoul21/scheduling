"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { STAFF_ROLES } from "@/lib/permissions/roles";
import { requireScope } from "@/lib/permissions/scope";
import { ACADEMIC_LEVELS } from "@/lib/academics/levels";
import { notifyManagers, notifyUsers } from "@/lib/notify";

type Result = { ok: true } | { ok: false; error: string };

const activitySchema = z
  .object({
    type: z.enum(["SCHOOL_EVENT", "HOLIDAY"]),
    title: z.string().trim().min(2, "Enter a title").max(120),
    description: z.string().max(500).optional(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a start date"),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose an end date"),
    startMin: z.number().int().min(0).max(24 * 60).nullable(),
    endMin: z.number().int().min(0).max(24 * 60).nullable(),
    departmentId: z.string().nullable(),
    level: z.enum(ACADEMIC_LEVELS).nullable(),
    roomId: z.string().nullable(),
    location: z.string().trim().max(120).optional(),
    participants: z.string().trim().max(300).optional(),
  })
  .refine((d) => d.endDate >= d.startDate, { message: "The end date cannot be before the start date." })
  .refine((d) => d.startMin === null || d.endMin === null || d.endMin > d.startMin, { message: "End time must be after start time." });

export type ActivityInput = z.infer<typeof activitySchema>;

function revalidate() {
  revalidatePath("/calendar");
  revalidatePath("/reports");
}

/**
 * Administrator activities are approved at once. A Head of Department submits for their own department,
 * and every new submission or edit waits for the Administrator's approval again.
 */
export async function saveActivityAction(input: ActivityInput, id?: string): Promise<Result> {
  const scope = await requireScope(...STAFF_ROLES);
  const parsed = activitySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the activity details." };
  const d = parsed.data;
  if (d.type === "HOLIDAY" && !scope.isAdmin) return { ok: false, error: "Only the Administrator can declare holidays." };
  if (!scope.isAdmin && !scope.departmentId) return { ok: false, error: "Your account is not linked to a department." };
  if (id) {
    const existing = await prisma.activity.findUnique({ where: { id } });
    if (!existing || existing.type === "CLASS_SUSPENSION") return { ok: false, error: "Edit class suspensions in Schedule Adjustments." };
    if (!scope.isAdmin && (existing.type === "HOLIDAY" || existing.departmentId !== scope.departmentId)) return { ok: false, error: "You can only edit your own department's activities." };
  }
  if (d.roomId && !(await prisma.room.findFirst({ where: { id: d.roomId, archivedAt: null }, select: { id: true } }))) return { ok: false, error: "That room is not available." };

  const holiday = d.type === "HOLIDAY";
  const data = {
    ...d,
    description: d.description || null,
    location: d.location || null,
    participants: d.participants || null,
    departmentId: scope.isAdmin ? d.departmentId : scope.departmentId,
    startDate: new Date(`${d.startDate}T00:00:00Z`),
    endDate: new Date(`${d.endDate}T00:00:00Z`),
    // Holidays always last the whole day.
    startMin: holiday ? null : d.startMin,
    endMin: holiday ? null : d.endMin,
    status: scope.isAdmin ? ("APPROVED" as const) : ("PENDING" as const),
    reviewNote: null,
    reviewedById: scope.isAdmin ? scope.userId : null,
    reviewedAt: scope.isAdmin ? new Date() : null,
  };
  const saved = id
    ? await prisma.activity.update({ where: { id }, data })
    : await prisma.activity.create({ data: { ...data, sectionIds: [], createdById: scope.userId } });
  await prisma.auditLog.create({
    data: { userId: scope.userId, action: `${id ? "Edited" : scope.isAdmin ? "Added" : "Submitted"} calendar activity "${d.title}"`, entity: "Activity", entityId: saved.id, newValue: d },
  });
  if (!scope.isAdmin) {
    await notifyManagers(null, {
      title: "Activity awaiting approval",
      message: `${scope.name} submitted "${d.title}" for approval.`,
      link: "/calendar?tab=approvals",
    });
  }
  revalidate();
  return { ok: true };
}

export async function deleteActivityAction(id: string): Promise<Result> {
  const scope = await requireScope(...STAFF_ROLES);
  const existing = await prisma.activity.findUnique({ where: { id } });
  if (!existing) return { ok: true };
  if (existing.type === "CLASS_SUSPENSION") return { ok: false, error: "Lift class suspensions in Schedule Adjustments so cancelled classes are restored." };
  if (!scope.isAdmin && (existing.type === "HOLIDAY" || existing.departmentId !== scope.departmentId)) return { ok: false, error: "You can only remove your own department's activities." };
  await prisma.activity.delete({ where: { id } });
  await prisma.auditLog.create({ data: { userId: scope.userId, action: `Deleted calendar activity "${existing.title}"`, entity: "Activity", entityId: id, oldValue: existing } });
  revalidate();
  return { ok: true };
}

const reviewSchema = z
  .object({
    ids: z.array(z.string().min(1)).min(1, "Select at least one activity.").max(200),
    decision: z.enum(["APPROVED", "REJECTED", "CHANGES_REQUESTED"]),
    note: z.string().trim().max(500).optional(),
  })
  .refine((r) => r.decision === "APPROVED" || !!r.note, { message: "Enter a reason so the submitter knows what to do." });

const DECISION_TEXT = { APPROVED: "approved", REJECTED: "rejected", CHANGES_REQUESTED: "returned for changes" } as const;

/** Approves, rejects, or returns one or more submitted activities and notifies each submitter. */
export async function reviewActivitiesAction(input: z.input<typeof reviewSchema>): Promise<Result & { count?: number }> {
  const scope = await requireScope("ADMINISTRATOR");
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid review." };
  const { ids, decision, note } = parsed.data;

  const targets = await prisma.activity.findMany({ where: { id: { in: ids }, type: { not: "CLASS_SUSPENSION" } } });
  if (targets.length === 0) return { ok: false, error: "Those activities no longer exist." };
  await prisma.activity.updateMany({
    where: { id: { in: targets.map((t) => t.id) } },
    data: { status: decision, reviewNote: note || null, reviewedById: scope.userId, reviewedAt: new Date() },
  });
  await prisma.auditLog.createMany({
    data: targets.map((t) => ({
      userId: scope.userId,
      action: `Activity "${t.title}" ${DECISION_TEXT[decision]}`,
      entity: "Activity",
      entityId: t.id,
      newValue: { status: decision, note: note || null },
    })),
  });
  for (const t of targets) {
    if (!t.createdById || t.createdById === scope.userId) continue;
    await notifyUsers([t.createdById], {
      title: `Activity ${DECISION_TEXT[decision]}`,
      message: `"${t.title}" was ${DECISION_TEXT[decision]}${note ? `: ${note}` : "."}`,
      link: "/calendar?tab=table",
      type: decision === "APPROVED" ? "SUCCESS" : decision === "REJECTED" ? "ERROR" : "WARNING",
    });
  }
  revalidate();
  return { ok: true, count: targets.length };
}
