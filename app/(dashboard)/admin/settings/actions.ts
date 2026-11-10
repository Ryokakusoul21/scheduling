"use server";

import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { SETTING_REQUIRE_APPROVAL } from "@/lib/auth/config";
import { SETTING_BOOKING, SETTING_WORKLOAD } from "@/lib/settings";
import { queueWorkloadCheck } from "@/lib/workload/auto";

const ADMIN = ["SUPER_ADMINISTRATOR"] as const;

const schema = z.object({
  name: z.string().min(1),
  location: z.string().min(1),
});

export async function updateInstitutionAction(formData: FormData) {
  const admin = await requireRole(...ADMIN);
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const previous = await prisma.systemSetting.findUnique({ where: { key: "institution" }, select: { value: true } });
  await prisma.systemSetting.upsert({
    where: { key: "institution" },
    update: { value: parsed.data },
    create: { key: "institution", value: parsed.data },
  });
  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: "Updated institution settings",
      entity: "SystemSetting",
      entityId: "institution",
      ...(previous ? { oldValue: previous.value as Prisma.InputJsonValue } : {}),
      newValue: parsed.data,
    },
  });
  revalidatePath("/admin/settings");
  return { ok: true };
}

const workloadSchema = z
  .object({
    measure: z.enum(["HOURS", "UNITS"]),
    minimum: z.coerce.number().min(0).max(60),
    maximum: z.coerce.number().min(1).max(60),
    partTimeMinimum: z.coerce.number().min(0).max(60),
    partTimeMaximum: z.coerce.number().min(1).max(60),
    maxUnits: z.coerce.number().min(1).max(60),
    tolerance: z.coerce.number().min(0).max(30),
    crossDepartment: z.enum(["BOTH_HEADS", "DISALLOWED"]),
  })
  .refine((d) => d.maximum > d.minimum, { message: "Full-time maximum load must be greater than the minimum load." })
  .refine((d) => d.partTimeMaximum > d.partTimeMinimum, { message: "Part-time maximum load must be greater than the minimum load." });

export async function updateWorkloadAction(formData: FormData) {
  const admin = await requireRole(...ADMIN);
  const parsed = workloadSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  await prisma.systemSetting.upsert({
    where: { key: SETTING_WORKLOAD },
    update: { value: parsed.data },
    create: { key: SETTING_WORKLOAD, value: parsed.data },
  });
  await prisma.auditLog.create({
    data: { userId: admin.id, action: "Updated teaching load limits", entity: "SystemSetting", entityId: SETTING_WORKLOAD, newValue: parsed.data },
  });
  revalidatePath("/admin/settings");
  revalidatePath("/workload");
  // New limits change who is over or under, so check every load again.
  queueWorkloadCheck("Teaching load settings changed", admin.id);
  return { ok: true };
}

export async function setRequireApprovalAction(enabled: boolean) {
  const admin = await requireRole(...ADMIN);
  await prisma.systemSetting.upsert({
    where: { key: SETTING_REQUIRE_APPROVAL },
    update: { value: enabled },
    create: { key: SETTING_REQUIRE_APPROVAL, value: enabled },
  });
  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: `${enabled ? "Enabled" : "Disabled"} Registrar approval for new registrations`,
      entity: "SystemSetting",
      entityId: SETTING_REQUIRE_APPROVAL,
    },
  });
  revalidatePath("/admin/settings");
  return { ok: true };
}

const time = z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM").transform((t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3)));
const bookingSchema = z
  .object({
    bufferMinutes: z.coerce.number().int().min(0).max(60),
    openTime: time,
    closeTime: time,
    urgentCapPerUser: z.coerce.number().int().min(0).max(100),
    urgentCapPerDepartment: z.coerce.number().int().min(0).max(500),
  })
  .refine((d) => d.closeTime > d.openTime, { message: "Rooms must close after they open." });

/** Buffer between bookings, operating hours, and monthly urgent override caps. */
export async function updateBookingSettingsAction(formData: FormData) {
  const admin = await requireRole(...ADMIN);
  const parsed = bookingSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const { openTime, closeTime, ...rest } = parsed.data;
  const value = { ...rest, openMin: openTime, closeMin: closeTime };
  await prisma.systemSetting.upsert({ where: { key: SETTING_BOOKING }, update: { value }, create: { key: SETTING_BOOKING, value } });
  await prisma.auditLog.create({ data: { userId: admin.id, action: "Updated room booking rules", entity: "SystemSetting", entityId: SETTING_BOOKING, newValue: value } });
  revalidatePath("/admin/settings");
  revalidatePath("/bookings");
  return { ok: true };
}
