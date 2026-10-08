"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { AUTH } from "@/lib/auth/config";
import { appUrl, sendMail } from "@/lib/email/mailer";
import { accountApprovedEmail } from "@/lib/email/templates";
import { passwordSchema } from "@/lib/validation/auth";

const ADMIN = ["SUPER_ADMIN", "ADMINISTRATOR"] as const;

const createSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  role: z.enum(["SUPER_ADMIN", "ADMINISTRATOR", "REGISTRAR", "SCHEDULER", "FACULTY", "STUDENT"]),
  password: passwordSchema,
});

export async function createUserAction(formData: FormData) {
  const admin = await requireRole(...ADMIN);
  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const d = parsed.data;

  try {
    const passwordHash = await bcrypt.hash(d.password, AUTH.bcryptRounds);
    const user = await prisma.user.create({
      // Admin-created accounts are trusted, so they skip email verification.
      data: { name: d.name, email: d.email, role: d.role, passwordHash, status: "ACTIVE", emailVerified: new Date() },
    });
    await prisma.auditLog.create({
      data: { userId: admin.id, action: `Created user account (${d.role})`, entity: "User", entityId: user.id },
    });
    revalidatePath("/admin/users");
    return { ok: true };
  } catch {
    return { ok: false, error: "A user with that email already exists." };
  }
}

const updateSchema = z.object({
  name: z.string().min(1),
  role: z.enum(["SUPER_ADMIN", "ADMINISTRATOR", "REGISTRAR", "SCHEDULER", "FACULTY", "STUDENT"]),
  status: z.enum(["PENDING", "ACTIVE", "INACTIVE", "SUSPENDED"]),
});

export async function updateUserAction(id: string, formData: FormData) {
  const admin = await requireRole(...ADMIN);
  const parsed = updateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  await prisma.user.update({ where: { id }, data: parsed.data });
  await prisma.auditLog.create({
    data: { userId: admin.id, action: "Updated user account", entity: "User", entityId: id },
  });
  revalidatePath("/admin/users");
  return { ok: true };
}

export async function resetPasswordAction(id: string, newPassword: string) {
  const admin = await requireRole(...ADMIN);
  const parsed = passwordSchema.safeParse(newPassword);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const passwordHash = await bcrypt.hash(newPassword, AUTH.bcryptRounds);
  // Bumping sessionVersion signs the user out everywhere; clearing the lockout lets them back in.
  await prisma.user.update({
    where: { id },
    data: { passwordHash, sessionVersion: { increment: 1 }, failedLoginAttempts: 0, lockedUntil: null },
  });
  await prisma.auditLog.create({
    data: { userId: admin.id, action: "Reset user password", entity: "User", entityId: id },
  });
  revalidatePath("/admin/users");
  return { ok: true };
}

export async function deleteUserAction(id: string) {
  const admin = await requireRole(...ADMIN);
  if (admin.id === id) return { ok: false, error: "You cannot delete your own account." };
  await prisma.user.delete({ where: { id } });
  await prisma.auditLog.create({
    data: { userId: admin.id, action: "Deleted user account", entity: "User", entityId: id },
  });
  revalidatePath("/admin/users");
  return { ok: true };
}

export async function approveUserAction(id: string) {
  const admin = await requireRole(...ADMIN);
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user || user.status !== "PENDING") return { ok: false, error: "This account is not awaiting approval." };

  await prisma.user.update({ where: { id }, data: { status: "ACTIVE" } });
  await prisma.auditLog.create({
    data: { userId: admin.id, action: "Approved user account", entity: "User", entityId: id },
  });
  await prisma.notification.create({
    data: { userId: id, type: "SUCCESS", title: "Welcome!", message: "Your account has been approved." },
  });
  await sendMail(accountApprovedEmail(user.email, user.name, appUrl("/login")));
  revalidatePath("/admin/users");
  return { ok: true };
}
