import "server-only";
import { prisma } from "@/lib/db/prisma";

export const SETTING_WORKLOAD = "workload";

/** Teaching load limits set by the Administrator; measured in weekly contact hours or subject units. */
export interface WorkloadSettings {
  measure: "HOURS" | "UNITS";
  minimum: number;
  maximum: number;
}

export const DEFAULT_WORKLOAD: WorkloadSettings = { measure: "HOURS", minimum: 12, maximum: 24 };

export async function getWorkloadSettings(): Promise<WorkloadSettings> {
  const row = await prisma.systemSetting.findUnique({ where: { key: SETTING_WORKLOAD } });
  return { ...DEFAULT_WORKLOAD, ...((row?.value as Partial<WorkloadSettings> | undefined) ?? {}) };
}
