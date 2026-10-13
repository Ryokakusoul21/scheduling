"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { STAFF_ROLES } from "@/lib/permissions/roles";
import { requireScope } from "@/lib/permissions/scope";

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
  })
  .refine((d) => d.endDate >= d.startDate, { message: "The end date cannot be before the start date." })
  .refine((d) => d.startMin === null || d.endMin === null || d.endMin > d.startMin, { message: "End time must be after start time." });

export type ActivityInput = z.infer<typeof activitySchema>;

/** School events may be managed by any staff; holidays cancel classes, so only the Administrator sets them. */
export async function saveActivityAction(input: ActivityInput, id?: string): Promise<Result> {
  const scope = await requireScope(...STAFF_ROLES);
  const parsed = activitySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the activity details." };
  const d = parsed.data;
  if (d.type === "HOLIDAY" && !scope.isAdmin) return { ok: false, error: "Only the Administrator can declare holidays." };
  if (id) {
    const existing = await prisma.activity.findUnique({ where: { id } });
    if (!existing || existing.type === "CLASS_SUSPENSION") return { ok: false, error: "Edit class suspensions in Schedule Adjustments." };
    if (existing.type === "HOLIDAY" && !scope.isAdmin) return { ok: false, error: "Only the Administrator can change holidays." };
  }

  const holiday = d.type === "HOLIDAY";
  const data = {
    ...d,
    description: d.description || null,
    startDate: new Date(`${d.startDate}T00:00:00Z`),
    endDate: new Date(`${d.endDate}T00:00:00Z`),
    // Holidays always last the whole day.
    startMin: holiday ? null : d.startMin,
    endMin: holiday ? null : d.endMin,
  };
  const saved = id
    ? await prisma.activity.update({ where: { id }, data })
    : await prisma.activity.create({ data: { ...data, sectionIds: [], createdById: scope.userId } });
  await prisma.auditLog.create({
    data: { userId: scope.userId, action: `${id ? "Edited" : "Added"} calendar activity "${d.title}"`, entity: "Activity", entityId: saved.id, newValue: d },
  });
  revalidatePath("/calendar");
  return { ok: true };
}

export async function deleteActivityAction(id: string): Promise<Result> {
  const scope = await requireScope(...STAFF_ROLES);
  const existing = await prisma.activity.findUnique({ where: { id } });
  if (!existing) return { ok: true };
  if (existing.type === "CLASS_SUSPENSION") return { ok: false, error: "Lift class suspensions in Schedule Adjustments so cancelled classes are restored." };
  if (existing.type === "HOLIDAY" && !scope.isAdmin) return { ok: false, error: "Only the Administrator can remove holidays." };
  await prisma.activity.delete({ where: { id } });
  await prisma.auditLog.create({ data: { userId: scope.userId, action: `Deleted calendar activity "${existing.title}"`, entity: "Activity", entityId: id, oldValue: existing } });
  revalidatePath("/calendar");
  return { ok: true };
}
