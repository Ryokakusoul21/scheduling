"use server";

import bcrypt from "bcryptjs";
import { headers } from "next/headers";
import { prisma } from "@/lib/db/prisma";
import { AUTH, SETTING_REQUIRE_APPROVAL } from "@/lib/auth/config";
import { verifyCaptcha } from "@/lib/auth/captcha";
import { clientIp } from "@/lib/auth/rate-limit";
import { consumeToken, findValidToken, isOnCooldown, issueToken } from "@/lib/auth/tokens";
import { sendVerification } from "@/lib/auth/verification";
import { appUrl, sendMail } from "@/lib/email/mailer";
import { passwordChangedEmail, passwordResetEmail } from "@/lib/email/templates";
import {
  forgotPasswordSchema,
  registerSchema,
  resetPasswordSchema,
  type ForgotPasswordInput,
  type RegisterInput,
  type ResetPasswordInput,
} from "@/lib/validation/auth";

/** Which set of authentication pages a request came from. */
export type Audience = "staff" | "student";

/** Students only use the student pages and staff only the staff pages. */
function matchesAudience(role: string, audience: Audience = "staff") {
  return (role === "STUDENT") === (audience === "student");
}

export type ActionResult =
  | { ok: true }
  | { ok: false; error?: string; fieldErrors?: Record<string, string> };

function fieldErrors(issues: { path: PropertyKey[]; message: string }[]) {
  const out: Record<string, string> = {};
  for (const i of issues) {
    const key = String(i.path[0] ?? "form");
    out[key] ??= i.message;
  }
  return out;
}

async function ip() {
  return clientIp(await headers());
}

function findUserByEmail(email: string) {
  return prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } } });
}

export async function requiresAdminApproval() {
  const setting = await prisma.systemSetting.findUnique({ where: { key: SETTING_REQUIRE_APPROVAL } });
  return setting?.value === true;
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export async function registerAction(
  input: RegisterInput & { captchaToken?: string },
): Promise<ActionResult> {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error.issues) };
  if (!(await verifyCaptcha(input.captchaToken, await ip()))) {
    return { ok: false, error: "CAPTCHA verification failed. Please try again." };
  }

  const { name, email, password } = parsed.data;
  if (await findUserByEmail(email)) {
    return { ok: false, fieldErrors: { email: "An account with this email already exists." } };
  }

  const needsApproval = await requiresAdminApproval();
  const user = await prisma.user.create({
    data: {
      name,
      email,
      passwordHash: await bcrypt.hash(password, AUTH.bcryptRounds),
      role: "FACULTY",
      status: needsApproval ? "PENDING" : "ACTIVE",
      termsAcceptedAt: new Date(),
    },
  });
  await prisma.auditLog.create({
    data: { userId: user.id, action: "Registered account", entity: "User", entityId: user.id },
  });
  await sendVerification(user);
  return { ok: true };
}

/** Always reports success so it can't be used to discover registered emails. */
export async function resendVerificationAction(email: string): Promise<ActionResult> {
  const parsed = forgotPasswordSchema.safeParse({ email });
  if (!parsed.success) return { ok: false, error: "Enter a valid email address." };

  const user = await findUserByEmail(parsed.data.email);
  if (
    user &&
    !user.emailVerified &&
    !(await isOnCooldown(user.id, "EMAIL_VERIFICATION", AUTH.emailResendCooldownSeconds))
  ) {
    await sendVerification(user);
  }
  return { ok: true };
}

/** Called from /verify-email when the page renders. */
export async function verifyEmailToken(token: string) {
  const record = await consumeToken(token, "EMAIL_VERIFICATION");
  if (!record) return { ok: false as const };

  const user = await prisma.user.update({
    where: { id: record.userId },
    data: { emailVerified: new Date() },
  });
  await prisma.auditLog.create({
    data: { userId: user.id, action: "Verified email address", entity: "User", entityId: user.id },
  });

  if (user.status === "PENDING") {
    const admins = await prisma.user.findMany({
      where: { role: "ADMINISTRATOR", status: "ACTIVE" },
      select: { id: true },
    });
    await prisma.notification.createMany({
      data: admins.map((a) => ({
        userId: a.id,
        type: "INFO" as const,
        title: "Account awaiting approval",
        message: `${user.name} (${user.email}) registered and verified their email.`,
        link: "/admin/users",
      })),
    });
  }
  return { ok: true as const, pending: user.status === "PENDING", student: user.role === "STUDENT" };
}

// ---------------------------------------------------------------------------
// Forgot / reset password
// ---------------------------------------------------------------------------

/** Always reports success so it can't be used to discover registered emails. */
export async function forgotPasswordAction(
  input: ForgotPasswordInput & { captchaToken?: string; audience?: Audience },
): Promise<ActionResult> {
  const parsed = forgotPasswordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error.issues) };
  if (!(await verifyCaptcha(input.captchaToken, await ip()))) {
    return { ok: false, error: "CAPTCHA verification failed. Please try again." };
  }

  const user = await findUserByEmail(parsed.data.email);
  if (
    user &&
    user.status !== "SUSPENDED" &&
    matchesAudience(user.role, input.audience) &&
    !(await isOnCooldown(user.id, "PASSWORD_RESET", AUTH.emailResendCooldownSeconds))
  ) {
    const token = await issueToken(user.id, "PASSWORD_RESET", AUTH.passwordResetTtlMinutes);
    const page = input.audience === "student" ? "/student/reset-password" : "/reset-password";
    await sendMail(
      passwordResetEmail(user.email, user.name, appUrl(`${page}?token=${token}`), AUTH.passwordResetTtlMinutes),
    );
    await prisma.auditLog.create({
      data: { userId: user.id, action: "Requested password reset", entity: "Auth", entityId: user.id },
    });
  }
  return { ok: true };
}

export async function resetPasswordAction(
  input: ResetPasswordInput & { token: string; audience?: Audience },
): Promise<ActionResult> {
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error.issues) };
  const pending = await findValidToken(input.token, "PASSWORD_RESET");
  if (pending && !matchesAudience(pending.user.role, input.audience)) {
    return { ok: false, error: "This reset link is invalid or has expired. Please request a new one." };
  }

  const record = await consumeToken(input.token, "PASSWORD_RESET");
  if (!record) {
    return { ok: false, error: "This reset link is invalid or has expired. Please request a new one." };
  }

  const now = new Date();
  const user = await prisma.user.update({
    where: { id: record.userId },
    data: {
      passwordHash: await bcrypt.hash(parsed.data.password, AUTH.bcryptRounds),
      // Invalidates every existing session for this account.
      sessionVersion: { increment: 1 },
      failedLoginAttempts: 0,
      lockedUntil: null,
      // Following an emailed link proves ownership of the address.
      emailVerified: record.user.emailVerified ?? now,
    },
  });

  await prisma.auditLog.create({
    data: { userId: user.id, action: "Reset password via email link", entity: "Auth", entityId: user.id },
  });
  await prisma.notification.create({
    data: {
      userId: user.id,
      type: "WARNING",
      title: "Password changed",
      message: "Your password was reset and all other sessions were signed out.",
    },
  });
  await sendMail(passwordChangedEmail(user.email, user.name, now));
  return { ok: true };
}
