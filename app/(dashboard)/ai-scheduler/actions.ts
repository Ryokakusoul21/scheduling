"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { generateScheduleForSections } from "@/lib/scheduler/service";
import { prisma } from "@/lib/db/prisma";

const generateSchema = z.object({
  semesterId: z.string().min(1, "Select a semester"),
  sectionIds: z.array(z.string()).min(1, "Select at least one section"),
});

export async function generateScheduleAction(input: { semesterId: string; sectionIds: string[] }) {
  const user = await requireRole("SUPER_ADMIN", "ADMINISTRATOR", "SCHEDULER");
  const parsed = generateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    const result = await generateScheduleForSections({ ...parsed.data, generatedBy: user.id });
    revalidatePath("/ai-scheduler");
    revalidatePath("/schedules");
    revalidatePath("/calendar");
    return { ok: true as const, result };
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : "Schedule generation failed." };
  }
}

export async function publishDraftAction(semesterId: string, version: number) {
  await requireRole("SUPER_ADMIN", "ADMINISTRATOR", "SCHEDULER");
  await prisma.schedule.updateMany({
    where: { semesterId, version, status: "DRAFT" },
    data: { status: "PUBLISHED" },
  });
  revalidatePath("/schedules");
  revalidatePath("/calendar");
  return { ok: true as const };
}

export async function discardDraftAction(semesterId: string, version: number) {
  await requireRole("SUPER_ADMIN", "ADMINISTRATOR", "SCHEDULER");
  await prisma.schedule.deleteMany({ where: { semesterId, version, status: "DRAFT" } });
  revalidatePath("/ai-scheduler");
  revalidatePath("/schedules");
  return { ok: true as const };
}
