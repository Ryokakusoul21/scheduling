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
import { describeDevice } from "@/lib/auth/device";
import { consumeRecoveryCode } from "@/lib/auth/recovery";

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

export const { handlers, signIn, signOut, auth, unstable_update } = NextAuth({
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
          // A recovery code works in place of the authenticator code and is spent when used.
          const valid =
            verifyTotp(decryptSecret(user.twoFactorSecret), code) ||
            (await consumeRecoveryCode(user.id, user.twoFactorRecoveryCodes, code));
          if (!valid) {
            const locked = await registerFailure(user.id, user.failedLoginAttempts);
            await recordLoginAttempt(email, ip, false);
            throw new LoginError(locked ? "locked" : "two_factor_invalid");
          }
        }

        if (!user.emailVerified) throw new LoginError("unverified");
        if (user.status === "PENDING") throw new LoginError("pending");
        if (user.status !== "ACTIVE" || user.archivedAt) throw new LoginError("inactive");

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

        // One row per sign-in feeds the device list; rows idle past the longest session are dropped.
        const session = await prisma.userSession.create({
          data: { userId: user.id, version: user.sessionVersion, device: describeDevice(request.headers.get("user-agent")), ipAddress: ip },
        });
        await prisma.userSession
          .deleteMany({ where: { userId: user.id, lastActiveAt: { lt: new Date(Date.now() - AUTH.rememberMeMaxAgeSeconds * 1000) } } })
          .catch(() => {});

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          status: user.status,
          sessionVersion: user.sessionVersion,
          remember: remember === "true",
          sessionId: session.id,
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
          select: { status: true, role: true, sessionVersion: true, archivedAt: true },
        });
      } catch (error) {
        // A brief database outage should not sign everyone out; the next request checks again.
        if (isDatabaseUnreachable(error)) {
          console.warn("Session check skipped: the database could not be reached.");
          return token;
        }
        throw error;
      }
      if (!current || current.status !== "ACTIVE" || current.archivedAt || current.sessionVersion !== token.sessionVersion) {
        return null;
      }
      token.role = current.role;
      token.status = current.status;

      // View as: started or stopped by /api/view-as; only a Super Administrator may view, never as another one.
      if (params.trigger === "update" && params.session && typeof params.session === "object" && "viewAs" in params.session) {
        const target = (params.session as { viewAs: unknown }).viewAs;
        token.viewAsId = typeof target === "string" && current.role === "SUPER_ADMINISTRATOR" && target !== token.id ? target : undefined;
      }
      if (token.viewAsId) {
        const viewed = current.role === "SUPER_ADMINISTRATOR"
          ? await prisma.user.findUnique({ where: { id: token.viewAsId }, select: { role: true, status: true, archivedAt: true, name: true, email: true } })
          : null;
        if (!viewed || viewed.status !== "ACTIVE" || viewed.archivedAt || viewed.role === "SUPER_ADMINISTRATOR") {
          token.viewAsId = undefined;
        } else {
          token.role = viewed.role;
          token.viewAsName = viewed.name;
          token.viewAsEmail = viewed.email;
        }
      }

      // A revoked device is signed out on its next request; active ones are touched at most every 5 minutes.
      if (token.sid) {
        const row = await prisma.userSession.findUnique({ where: { id: token.sid }, select: { revokedAt: true, lastActiveAt: true } });
        if (!row || row.revokedAt) return null;
        if (Date.now() - row.lastActiveAt.getTime() > 5 * 60_000) {
          await prisma.userSession.update({ where: { id: token.sid }, data: { lastActiveAt: new Date() } }).catch(() => {});
        }
      }
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
      const sid = "token" in message ? message.token?.sid : undefined;
      if (sid) await prisma.userSession.updateMany({ where: { id: sid, revokedAt: null }, data: { revokedAt: new Date() } }).catch(() => {});
      await prisma.auditLog
        .create({ data: { userId, action: "Signed out", entity: "Auth", entityId: userId } })
        .catch(() => {});
    },
  },
});
