"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { TEACHING_ROLES } from "@/lib/permissions/roles";
import { requireScope } from "@/lib/permissions/scope";
import { notifyManagers } from "@/lib/notify";

type Result = { ok: true } | { ok: false; error: string };

const schema = z
  .object({
    start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the dates"),
    end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the dates"),
    startMin: z.number().int().min(0).max(24 * 60).nullable(),
    endMin: z.number().int().min(0).max(24 * 60).nullable(),
    reason: z.string().trim().min(3, "Give a reason").max(300),
  })
  .refine((d) => d.end >= d.start, { message: "The end date cannot be before the start date." })
  .refine((d) => (d.startMin === null) === (d.endMin === null) && (d.startMin === null || d.endMin! > d.startMin), { message: "Give both times, or neither for whole days." });

/** A faculty member reports being unavailable; their Head of Department and the Administrator review it in Schedule Adjustments. */
export async function reportUnavailabilityAction(input: z.infer<typeof schema>): Promise<Result> {
  const scope = await requireScope(...TEACHING_ROLES);
  if (!scope.facultyId) return { ok: false, error: "Your account is not linked to a faculty record. Ask the Administrator to link it." };
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the details." };
  const d = parsed.data;
  if (d.start < new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" })) return { ok: false, error: "Report today or a future date." };

  const report = await prisma.unavailability.create({
    data: {
      kind: "FACULTY", facultyId: scope.facultyId, reason: d.reason, reportedById: scope.userId,
      startDate: new Date(`${d.start}T00:00:00Z`), endDate: new Date(`${d.end}T00:00:00Z`), startMin: d.startMin, endMin: d.endMin,
    },
  });
  await notifyManagers(scope.departmentId, {
    title: "Faculty unavailability reported",
    message: `${scope.name} reported being unavailable ${d.start === d.end ? `on ${d.start}` : `from ${d.start} to ${d.end}`}: ${d.reason}`,
    link: `/adjustments?report=${report.id}`,
    type: "WARNING",
  });
  await prisma.auditLog.create({ data: { userId: scope.userId, action: "Reported unavailability", entity: "Unavailability", entityId: report.id, newValue: d } });
  revalidatePath("/availability");
  revalidatePath("/adjustments");
  return { ok: true };
}

export async function withdrawReportAction(id: string): Promise<Result> {
  const scope = await requireScope(...TEACHING_ROLES);
  const report = await prisma.unavailability.findUnique({ where: { id } });
  if (!report || report.reportedById !== scope.userId || report.status !== "PENDING") return { ok: false, error: "Only your own pending reports can be withdrawn." };
  await prisma.unavailability.delete({ where: { id } });
  revalidatePath("/availability");
  revalidatePath("/adjustments");
  return { ok: true };
}
