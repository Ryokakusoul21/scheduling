"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { SETTING_REQUIRE_APPROVAL } from "@/lib/auth/config";

const ADMIN = ["SUPER_ADMIN", "ADMINISTRATOR"] as const;

const schema = z.object({
  name: z.string().min(1),
  shortName: z.string().min(1),
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
      action: `${enabled ? "Enabled" : "Disabled"} admin approval for new registrations`,
      entity: "SystemSetting",
      entityId: SETTING_REQUIRE_APPROVAL,
    },
  });
  revalidatePath("/admin/settings");
  return { ok: true };
}
