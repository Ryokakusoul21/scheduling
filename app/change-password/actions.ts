"use server";

import bcrypt from "bcryptjs";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { AUTH } from "@/lib/auth/config";
import { resetPasswordSchema, type ResetPasswordInput } from "@/lib/validation/auth";

/** Replaces an administrator-issued password with one only the user knows. */
export async function setOwnPasswordAction(input: ResetPasswordInput): Promise<{ ok: true } | { ok: false; error: string }> {
  const { id } = await requireUser();
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const user = await prisma.user.findUniqueOrThrow({ where: { id }, select: { passwordHash: true } });
  if (await bcrypt.compare(parsed.data.password, user.passwordHash)) return { ok: false, error: "Choose a password different from the one you were given." };
  await prisma.user.update({ where: { id }, data: { passwordHash: await bcrypt.hash(parsed.data.password, AUTH.bcryptRounds), mustChangePassword: false } });
  await prisma.auditLog.create({ data: { userId: id, action: "Set own password after administrator issue", entity: "Auth", entityId: id } });
  return { ok: true };
}
