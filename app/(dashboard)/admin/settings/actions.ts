"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { SETTING_REQUIRE_APPROVAL } from "@/lib/auth/config";
import { SETTING_WORKLOAD } from "@/lib/settings";

const ADMIN = ["ADMINISTRATOR"] as const;

const schema = z.object({
  name: z.string().min(1),
  location: z.string().min(1),
});

export async function updateInstitutionAction(formData: FormData) {
  await requireRole(...ADMIN);
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  await prisma.systemSetting.upsert({
    where: { key: "institution" },
    update: { value: parsed.data },
    create: { key: "institution", value: parsed.data },
  });
  revalidatePath("/admin/settings");
  return { ok: true };
}

const workloadSchema = z
  .object({
    measure: z.enum(["HOURS", "UNITS"]),
    minimum: z.coerce.number().min(0).max(60),
    maximum: z.coerce.number().min(1).max(60),
  })
  .refine((d) => d.maximum > d.minimum, { message: "Maximum load must be greater than the minimum load." });

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
      action: `${enabled ? "Enabled" : "Disabled"} Administrator approval for new registrations`,
      entity: "SystemSetting",
      entityId: SETTING_REQUIRE_APPROVAL,
    },
  });
  revalidatePath("/admin/settings");
  return { ok: true };
}
