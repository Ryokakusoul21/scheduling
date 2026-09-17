"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUser, requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

const STAFF = ["SUPER_ADMIN", "ADMINISTRATOR", "REGISTRAR", "SCHEDULER"] as const;

const createSchema = z.object({
  type: z.enum(["NEW_SCHEDULE", "CHANGE_TIME", "CHANGE_ROOM", "CHANGE_FACULTY", "CANCEL_SCHEDULE"]),
  scheduleId: z.string().optional(),
  reason: z.string().min(1, "Please describe the request"),
});

export async function createRequestAction(formData: FormData) {
  const user = await requireUser();
  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const d = parsed.data;

  await prisma.scheduleRequest.create({
    data: {
      type: d.type,
      scheduleId: d.scheduleId || null,
      reason: d.reason,
      requestedById: user.id,
      details: { reason: d.reason },
    },
  });

  await prisma.notification.createMany({
    data: (
      await prisma.user.findMany({ where: { role: { in: ["SUPER_ADMIN", "ADMINISTRATOR", "SCHEDULER"] } }, select: { id: true } })
    ).map((u) => ({
      userId: u.id,
      type: "INFO",
      title: "New scheduling request submitted",
      message: `${user.name} submitted a ${d.type.replace(/_/g, " ").toLowerCase()} request.`,
      link: "/requests",
    })),
  });

  revalidatePath("/requests");
  return { ok: true };
}

export async function reviewRequestAction(id: string, status: "APPROVED" | "REJECTED", reviewNote?: string) {
  const user = await requireRole(...STAFF);
  const request = await prisma.scheduleRequest.update({
    where: { id },
    data: { status, reviewNote, reviewedById: user.id },
  });

  await prisma.notification.create({
    data: {
      userId: request.requestedById,
      type: status === "APPROVED" ? "SUCCESS" : "WARNING",
      title: `Schedule request ${status.toLowerCase()}`,
      message: `Your ${request.type.replace(/_/g, " ").toLowerCase()} request was ${status.toLowerCase()}.`,
      link: "/requests",
    },
  });

  revalidatePath("/requests");
  return { ok: true };
}
