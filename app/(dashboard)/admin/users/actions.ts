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

const ADMIN = ["ADMINISTRATOR"] as const;

const createSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  role: z.enum(["ADMINISTRATOR", "HEAD_OF_DEPARTMENT", "FACULTY"]),
  facultyId: z.string().optional(),
  password: passwordSchema,
});

const LINK_TAKEN = "That faculty record is already linked to another account.";

export async function createUserAction(formData: FormData) {
  const admin = await requireRole(...ADMIN);
  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const d = parsed.data;

  try {
    const passwordHash = await bcrypt.hash(d.password, AUTH.bcryptRounds);
    const user = await prisma.user.create({
      // Admin-created accounts are trusted, so they skip email verification.
      data: {
        name: d.name,
        email: d.email,
        role: d.role,
        facultyId: d.facultyId || null,
        passwordHash,
        status: "ACTIVE",
        emailVerified: new Date(),
      },
    });
    await prisma.auditLog.create({
      data: { userId: admin.id, action: `Created user account (${d.role})`, entity: "User", entityId: user.id },
    });
    revalidatePath("/admin/users");
    return { ok: true };
  } catch {
    return { ok: false, error: `A user with that email already exists, or ${LINK_TAKEN.toLowerCase()}` };
  }
}

const updateSchema = z.object({
  name: z.string().min(1),
  role: z.enum(["ADMINISTRATOR", "HEAD_OF_DEPARTMENT", "FACULTY"]),
  status: z.enum(["PENDING", "ACTIVE", "INACTIVE", "SUSPENDED"]),
  facultyId: z.string().optional(),
});

export async function updateUserAction(id: string, formData: FormData) {
  const admin = await requireRole(...ADMIN);
  const parsed = updateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  // Student accounts keep their role; only the name and status can change here.
  const target = await prisma.user.findUnique({ where: { id }, select: { role: true } });
  const data = target?.role === "STUDENT" ? { name: parsed.data.name, status: parsed.data.status } : { ...parsed.data, facultyId: parsed.data.facultyId || null };
  try {
    await prisma.user.update({ where: { id }, data });
  } catch {
    return { ok: false, error: LINK_TAKEN };
  }
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
