"use server";

import bcrypt from "bcryptjs";
import QRCode from "qrcode";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { AUTH } from "@/lib/auth/config";
import { decryptSecret, encryptSecret } from "@/lib/auth/crypto";
import { generateTotpSecret, totpUri, verifyTotp } from "@/lib/auth/totp";
import { sendMail } from "@/lib/email/mailer";
import { passwordChangedEmail } from "@/lib/email/templates";
import { changePasswordSchema, type ChangePasswordInput } from "@/lib/validation/auth";

type Result = { ok: true } | { ok: false; error: string };

async function audit(userId: string, action: string) {
  await prisma.auditLog.create({ data: { userId, action, entity: "Auth", entityId: userId } });
}

export async function changePasswordAction(input: ChangePasswordInput): Promise<Result> {
  const { id } = await requireUser();
  const parsed = changePasswordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };

  const user = await prisma.user.findUniqueOrThrow({ where: { id } });
  if (!(await bcrypt.compare(parsed.data.currentPassword, user.passwordHash))) {
    return { ok: false, error: "Your current password is incorrect." };
  }

  await prisma.user.update({
    where: { id },
    data: {
      passwordHash: await bcrypt.hash(parsed.data.password, AUTH.bcryptRounds),
      sessionVersion: { increment: 1 },
    },
  });
  await audit(id, "Changed password");
  await sendMail(passwordChangedEmail(user.email, user.name, new Date()));
  return { ok: true };
}

/** Invalidates every session for this account, including the current one. */
export async function signOutEverywhereAction(): Promise<Result> {
  const { id } = await requireUser();
  await prisma.user.update({ where: { id }, data: { sessionVersion: { increment: 1 } } });
  await audit(id, "Signed out of all devices");
  return { ok: true };
}

export async function startTwoFactorSetupAction(): Promise<
  { ok: true; secret: string; qr: string } | { ok: false; error: string }
> {
  const { id, email } = await requireUser();
  const user = await prisma.user.findUniqueOrThrow({ where: { id } });
  if (user.twoFactorEnabled) return { ok: false, error: "Two-factor authentication is already enabled." };

  const secret = generateTotpSecret();
  await prisma.user.update({ where: { id }, data: { twoFactorSecret: encryptSecret(secret) } });
  const qr = await QRCode.toDataURL(totpUri(secret, email ?? user.email), { margin: 1, width: 200 });
  return { ok: true, secret, qr };
}

export async function confirmTwoFactorAction(code: string): Promise<Result> {
  const { id } = await requireUser();
  const user = await prisma.user.findUniqueOrThrow({ where: { id } });
  if (!user.twoFactorSecret) return { ok: false, error: "Start the setup again." };
  if (!verifyTotp(decryptSecret(user.twoFactorSecret), code)) {
    return { ok: false, error: "That code is incorrect. Check your authenticator app and try again." };
  }
  await prisma.user.update({ where: { id }, data: { twoFactorEnabled: true } });
  await audit(id, "Enabled two-factor authentication");
  revalidatePath("/profile");
  return { ok: true };
}

export async function disableTwoFactorAction(password: string, code: string): Promise<Result> {
  const { id } = await requireUser();
  const user = await prisma.user.findUniqueOrThrow({ where: { id } });
  if (!(await bcrypt.compare(password, user.passwordHash))) return { ok: false, error: "Incorrect password." };
  if (!user.twoFactorSecret || !verifyTotp(decryptSecret(user.twoFactorSecret), code)) {
    return { ok: false, error: "That verification code is incorrect." };
  }
  await prisma.user.update({ where: { id }, data: { twoFactorEnabled: false, twoFactorSecret: null } });
  await audit(id, "Disabled two-factor authentication");
  revalidatePath("/profile");
  return { ok: true };
}
