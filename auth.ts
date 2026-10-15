import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { authConfig } from "./auth.config";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { AUTH } from "@/lib/auth/config";
import { LoginError } from "@/lib/auth/errors";
import { clientIp, isIpRateLimited, recordLoginAttempt } from "@/lib/auth/rate-limit";
import { verifyCaptcha } from "@/lib/auth/captcha";
import { decryptSecret } from "@/lib/auth/crypto";
import { verifyTotp } from "@/lib/auth/totp";

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
  remember: z.string().optional(),
  code: z.string().optional(),
  captchaToken: z.string().optional(),
  /** Which login page was used; students and staff cannot sign in through each other's page. */
  portal: z.enum(["staff", "student"]).default("staff"),
});

// Compared against when the email doesn't exist so response timing doesn't
// reveal which accounts are registered.
const DUMMY_HASH = "$2b$12$RHdpRhSHROb.ov9d2KvV2ulO9PFsTe8jCVFqYwUEhXznRbec8VSN2";

async function registerFailure(userId: string, failedLoginAttempts: number) {
  const attempts = failedLoginAttempts + 1;
  const lock = attempts >= AUTH.maxFailedAttempts;
  await prisma.user.update({
    where: { id: userId },
    data: lock
      ? { failedLoginAttempts: 0, lockedUntil: new Date(Date.now() + AUTH.lockoutMinutes * 60_000) }
      : { failedLoginAttempts: attempts },
  });
  return lock;
}

/** Connection failures (as opposed to real answers such as "user not found"). */
function isDatabaseUnreachable(error: unknown) {
  if (error instanceof Prisma.PrismaClientInitializationError) return true;
  return error instanceof Prisma.PrismaClientKnownRequestError && ["P1001", "P1002", "P1008", "P1017"].includes(error.code);
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        remember: {},
        code: {},
        captchaToken: {},
        portal: {},
      },
      async authorize(rawCredentials, request) {
        const parsed = credentialsSchema.safeParse(rawCredentials);
        if (!parsed.success) throw new LoginError("invalid");
        const { email, password, remember, code, captchaToken, portal } = parsed.data;
        const ip = clientIp(request.headers);

        if (!(await verifyCaptcha(captchaToken, ip))) throw new LoginError("captcha");
        if (await isIpRateLimited(ip)) throw new LoginError("rate_limited");

        const user = await prisma.user.findFirst({
          where: { email: { equals: email, mode: "insensitive" } },
        });

        if (!user) {
          await bcrypt.compare(password, DUMMY_HASH);
          await recordLoginAttempt(email, ip, false);
          throw new LoginError("invalid");
        }

        if (user.lockedUntil && user.lockedUntil > new Date()) {
          await recordLoginAttempt(email, ip, false);
          throw new LoginError("locked");
        }

        if (!(await bcrypt.compare(password, user.passwordHash))) {
          const locked = await registerFailure(user.id, user.failedLoginAttempts);
          await recordLoginAttempt(email, ip, false);
          throw new LoginError(locked ? "locked" : "invalid");
        }

        // A wrong portal answers like a wrong password so it reveals nothing about the account.
        if ((user.role === "STUDENT") !== (portal === "student")) {
          await recordLoginAttempt(email, ip, false);
          throw new LoginError("invalid");
        }

        // Password is correct from here on, so account-state errors don't leak anything.
        if (user.twoFactorEnabled && user.twoFactorSecret) {
          if (!code) throw new LoginError("two_factor_required");
          if (!verifyTotp(decryptSecret(user.twoFactorSecret), code)) {
            const locked = await registerFailure(user.id, user.failedLoginAttempts);
            await recordLoginAttempt(email, ip, false);
            throw new LoginError(locked ? "locked" : "two_factor_invalid");
          }
        }

        if (!user.emailVerified) throw new LoginError("unverified");
        if (user.status === "PENDING") throw new LoginError("pending");
        if (user.status !== "ACTIVE") throw new LoginError("inactive");

        // Transparently upgrade hashes created with a lower bcrypt cost.
        const rehash =
          bcrypt.getRounds(user.passwordHash) < AUTH.bcryptRounds
            ? await bcrypt.hash(password, AUTH.bcryptRounds)
            : undefined;

        await prisma.user.update({
          where: { id: user.id },
          data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date(), passwordHash: rehash },
        });
        await recordLoginAttempt(email, ip, true);

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          status: user.status,
          sessionVersion: user.sessionVersion,
          remember: remember === "true",
        };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt(params) {
      const token = await authConfig.callbacks.jwt(params);
      if (!token || params.user) return token;

      // Re-validate against the database so password resets, "sign out
      // everywhere", deactivation and role changes take effect immediately.
      let current;
      try {
        current = await prisma.user.findUnique({
          where: { id: token.id },
          select: { status: true, role: true, sessionVersion: true },
        });
      } catch (error) {
        // A brief database outage should not sign everyone out; the next request checks again.
        if (isDatabaseUnreachable(error)) {
          console.warn("Session check skipped: the database could not be reached.");
          return token;
        }
        throw error;
      }
      if (!current || current.status !== "ACTIVE" || current.sessionVersion !== token.sessionVersion) {
        return null;
      }
      token.role = current.role;
      token.status = current.status;
      return token;
    },
  },
  events: {
    async signIn({ user }) {
      if (!user.id) return;
      await prisma.auditLog.create({
        data: { userId: user.id, action: "Signed in", entity: "Auth", entityId: user.id },
      });
    },
    async signOut(message) {
      const userId = "token" in message ? message.token?.id : undefined;
      if (!userId) return;
      await prisma.auditLog
        .create({ data: { userId, action: "Signed out", entity: "Auth", entityId: userId } })
        .catch(() => {});
    },
  },
});
