import "server-only";
import { prisma } from "@/lib/db/prisma";
import { DEFAULT_BOOKING_SETTINGS, type BookingSettings } from "@/lib/bookings/plan";

export const SETTING_WORKLOAD = "workload";

/**
 * Teaching load rules set by the Registrar. Loads are weekly contact hours or subject units; part-time
 * faculty have their own range, units are capped separately, and the tolerance is how far a load may sit
 * from its department's average before the check evens it out. Every fix needs Head of Department approval.
 */
export interface WorkloadSettings {
  measure: "HOURS" | "UNITS";
  minimum: number;
  maximum: number;
  partTimeMinimum: number;
  partTimeMaximum: number;
  maxUnits: number;
  tolerance: number;
  /** Cross-department reassignments: approved by both Heads of Department, or never proposed. */
  crossDepartment: "BOTH_HEADS" | "DISALLOWED";
}

export const DEFAULT_WORKLOAD: WorkloadSettings = {
  measure: "HOURS", minimum: 12, maximum: 24, partTimeMinimum: 12, partTimeMaximum: 24, maxUnits: 30, tolerance: 6, crossDepartment: "BOTH_HEADS",
};

export async function getWorkloadSettings(): Promise<WorkloadSettings> {
  const row = await prisma.systemSetting.findUnique({ where: { key: SETTING_WORKLOAD } });
  // Older saved values may lack the newer fields (or carry the retired automatic mode), so defaults fill the gaps.
  const saved = (row?.value as Partial<WorkloadSettings> | undefined) ?? {};
  const keys = Object.keys(DEFAULT_WORKLOAD) as (keyof WorkloadSettings)[];
  return Object.fromEntries(keys.map((k) => [k, saved[k] ?? DEFAULT_WORKLOAD[k]])) as unknown as WorkloadSettings;
}

export const SETTING_BOOKING = "booking";

/** Room booking rules set by the Registrar: buffer between bookings, operating hours, and monthly override caps. */
export async function getBookingSettings(): Promise<BookingSettings> {
  const row = await prisma.systemSetting.findUnique({ where: { key: SETTING_BOOKING } });
  return { ...DEFAULT_BOOKING_SETTINGS, ...((row?.value as Partial<BookingSettings> | undefined) ?? {}) };
}
