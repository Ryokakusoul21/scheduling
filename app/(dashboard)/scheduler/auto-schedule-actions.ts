"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireScope } from "@/lib/permissions/scope";
import { AutoScheduleError, applyAutoSchedule, previewAutoSchedule } from "@/lib/scheduler/auto-schedule";
import { Prisma } from "@prisma/client";

const ids = z.array(z.string().min(1)).min(1).max(200).transform((v) => [...new Set(v)]);

export async function previewAutoScheduleAction(input: { sectionIds: string[] }) {
  const scope = await requireScope("HEAD_OF_DEPARTMENT");
  const parsed = z.object({ sectionIds: ids }).safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Choose at least one editable section." };
  try { return { ok: true as const, data: await previewAutoSchedule(scope, parsed.data.sectionIds) }; }
  catch (error) { if (error instanceof AutoScheduleError) return { ok: false as const, error: error.message }; throw error; }
}

export async function applyAutoScheduleAction(input: { proposalId: string; changeIds: string[] }) {
  const scope = await requireScope("HEAD_OF_DEPARTMENT");
  const parsed = z.object({ proposalId: z.string().min(1), changeIds: z.array(z.string().min(1)).min(1).max(1000) }).safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Choose meetings from a generated preview." };
  try {
    const changes = await applyAutoSchedule(scope, parsed.data.proposalId, parsed.data.changeIds);
    for (const path of ["/scheduler", "/subjects", "/sections", "/workload", "/my-subjects", "/dashboard", "/analytics"]) revalidatePath(path);
    return { ok: true as const, changes };
  } catch (error) {
    if (error instanceof AutoScheduleError) return { ok: false as const, error: error.message };
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") return { ok: false as const, error: "The timetable changed during saving. Generate a new preview." };
    throw error;
  }
}
