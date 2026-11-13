"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { policyUserFromScope, requireScope } from "@/lib/permissions/scope";
import { can } from "@/lib/permissions/policy";
import { STAFF_ROLES } from "@/lib/permissions/roles";
import { departmentProfileSchema, DEPARTMENT_LOGO_MAX_BYTES } from "@/lib/departments/branding";
import { deleteDepartmentLogo, DepartmentLogoError, saveDepartmentLogo } from "@/lib/departments/logo-storage";

type Result = { ok: true; profile: { name: string; logoUrl: string | null; updatedAt: string } } | { ok: false; error: string };
const STALE = "This department was updated by someone else. Reload the page before saving.";

export async function saveDepartmentProfileAction(departmentId: string, form: FormData): Promise<Result> {
  const scope = await requireScope(...STAFF_ROLES);
  if (!can(policyUserFromScope(scope), "updateBranding", { type: "department", id: departmentId, departmentId })) {
    return { ok: false, error: "You can only update your assigned departments." };
  }
  // Refuse before writing an upload to disk while an administrator is viewing another account.
  if ((await getSession())?.user.realId) return { ok: false, error: "Return to your own account to edit a department profile." };
  const parsed = departmentProfileSchema.safeParse({ name: form.get("name"), updatedAt: form.get("updatedAt"), removeLogo: form.get("removeLogo") === "true" });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the profile details." };
  const upload = form.get("logo");
  const file = upload instanceof File && upload.size > 0 ? upload : null;
  if (file && parsed.data.removeLogo) return { ok: false, error: "Choose a new logo or remove the current one." };
  if (file && file.size > DEPARTMENT_LOGO_MAX_BYTES) return { ok: false, error: "Use an image up to 2 MB." };
  const current = await prisma.department.findUnique({ where: { id: departmentId }, select: { name: true, logoUrl: true, updatedAt: true } });
  if (!current) return { ok: false, error: "This department no longer exists." };
  if (current.updatedAt.toISOString() !== parsed.data.updatedAt) return { ok: false, error: STALE };
  const clash = await prisma.department.findFirst({ where: { id: { not: departmentId }, name: { equals: parsed.data.name, mode: "insensitive" } }, select: { id: true } });
  if (clash) return { ok: false, error: "Another department already uses that name." };
  let uploadedUrl: string | null = null;
  let savedProfile: { name: string; logoUrl: string | null; updatedAt: string };
  try {
    if (file) uploadedUrl = await saveDepartmentLogo(departmentId, Buffer.from(await file.arrayBuffer()));
    const logoUrl = uploadedUrl ?? (parsed.data.removeLogo ? null : current.logoUrl);
    if (current.name === parsed.data.name && current.logoUrl === logoUrl) {
      return { ok: true, profile: { name: current.name, logoUrl, updatedAt: current.updatedAt.toISOString() } };
    }
    const updatedAt = new Date();
    await prisma.$transaction(async (tx) => {
      const updated = await tx.department.updateMany({ where: { id: departmentId, updatedAt: current.updatedAt },
        data: { name: parsed.data.name, logoUrl, updatedAt },
      });
      if (updated.count !== 1) throw new Error(STALE);
      await tx.auditLog.create({ data: {
        userId: scope.userId, role: scope.role, departmentId, entity: "Department", entityId: departmentId,
        action: "Updated department profile", oldValue: { name: current.name, logoUrl: current.logoUrl },
        newValue: { name: parsed.data.name, logoUrl },
      } });
    });
    savedProfile = { name: parsed.data.name, logoUrl, updatedAt: updatedAt.toISOString() };
  } catch (error) {
    if (uploadedUrl) await deleteDepartmentLogo(uploadedUrl).catch((cleanupError) => console.error("Department logo cleanup failed", cleanupError));
    if (error instanceof DepartmentLogoError || (error instanceof Error && error.message === STALE)) return { ok: false, error: error.message };
    console.error("Department profile save failed", error);
    return { ok: false, error: "Could not save the department profile. Your changes are still here; please retry." };
  }
  if (current.logoUrl !== savedProfile.logoUrl) await deleteDepartmentLogo(current.logoUrl).catch((error) => console.error("Department logo cleanup failed", error));
  revalidatePath("/", "layout");
  return { ok: true, profile: savedProfile };
}
