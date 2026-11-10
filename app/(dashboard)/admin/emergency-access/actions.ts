"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { checkClass, revalidateScheduler } from "@/lib/scheduler/class-save";
import { notifyFaculty, notifyManagers, notifyUsers } from "@/lib/notify";
import { queueWorkloadCheck } from "@/lib/workload/auto";

const schema = z.object({
  id: z.string().min(1),
  updatedAt: z.iso.datetime(),
  roomId: z.string().min(1, "Choose a room."),
  dayOfWeek: z.enum(["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"]),
  startMin: z.number().int().min(0).max(1439),
  endMin: z.number().int().min(1).max(1440),
  reason: z.string().trim().min(20, "Explain the emergency in at least 20 characters.").max(1000),
  confirmed: z.boolean().refine((value) => value, "Confirm this is an emergency correction."),
}).refine((d) => d.endMin > d.startMin, { message: "End time must be after start time." });

/** Deliberately separate from routine editing: placement only, never academic content or publication. */
export async function emergencyCorrectionAction(input: z.input<typeof schema>) {
  const admin = await requireRole("SUPER_ADMINISTRATOR");
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the correction." };
  const { id, updatedAt, reason, roomId, dayOfWeek, startMin, endMin } = parsed.data;
  const before = await prisma.schedule.findUnique({ where: { id } });
  if (!before || before.status !== "PUBLISHED") return { ok: false, error: "Emergency corrections apply only to published classes." };
  if (before.updatedAt.toISOString() !== updatedAt) return { ok: false, error: "This class changed. Reload it before correcting it." };
  const placement = { roomId, dayOfWeek, startMin, endMin };
  if (Object.entries(placement).every(([key, value]) => before[key as keyof typeof placement] === value)) {
    return { ok: false, error: "Change the room, day, or time before saving a correction." };
  }
  const problem = await checkClass({ ...before, ...placement, notes: before.notes ?? undefined }, { userId: admin.id }, { overrideSoft: false });
  if (problem) return { ok: false, error: problem.error };

  const result = await prisma.$transaction(async (tx) => {
    const changed = await tx.schedule.updateMany({
      where: { id, updatedAt: before.updatedAt, status: "PUBLISHED" },
      data: { ...placement, version: { increment: 1 } },
    });
    if (!changed.count) return { ok: false, error: "This class changed. Reload it before correcting it." };
    const snapshot = { roomId: before.roomId, dayOfWeek: before.dayOfWeek, startMin: before.startMin, endMin: before.endMin, status: before.status, version: before.version };
    await tx.auditLog.create({ data: {
      userId: admin.id, role: admin.role, departmentId: before.departmentId,
      action: "Emergency class schedule correction", entity: "Schedule", entityId: id,
      reason, oldValue: snapshot, newValue: { ...placement, status: before.status, version: before.version + 1 },
    } });
    const message = { title: "Emergency class schedule correction", message: `An Administrator corrected a published class placement. Reason: ${reason}`, link: "/scheduler", type: "WARNING" as const };
    const students = await tx.student.findMany({ where: { sectionId: before.sectionId, user: { status: "ACTIVE", archivedAt: null } }, select: { userId: true } });
    await notifyManagers(before.departmentId, message, tx);
    await notifyFaculty([before.facultyId], message, tx);
    await notifyUsers(students.map((s) => s.userId), message, tx);
    return { ok: true };
  });
  if (result.ok) {
    revalidateScheduler();
    revalidatePath("/admin/emergency-access");
    revalidatePath("/admin/audit-logs");
    revalidatePath("/student/schedule");
    revalidatePath("/calendar");
    queueWorkloadCheck("An emergency class placement was corrected", admin.id);
  }
  return result;
}
