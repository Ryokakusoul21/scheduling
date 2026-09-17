"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

const ADMIN = ["SUPER_ADMIN", "ADMINISTRATOR"] as const;

const createSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  role: z.enum(["SUPER_ADMIN", "ADMINISTRATOR", "REGISTRAR", "SCHEDULER", "FACULTY", "STUDENT"]),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export async function createUserAction(formData: FormData) {
  const admin = await requireRole(...ADMIN);
  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const d = parsed.data;

  try {
    const passwordHash = await bcrypt.hash(d.password, 10);
    const user = await prisma.user.create({
      data: { name: d.name, email: d.email, role: d.role, passwordHash, status: "ACTIVE" },
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
  status: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]),
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
  if (newPassword.length < 6) return { ok: false, error: "Password must be at least 6 characters." };
  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { id }, data: { passwordHash } });
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
