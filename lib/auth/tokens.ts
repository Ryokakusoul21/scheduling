import "server-only";
import type { AuthTokenType } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { generateToken, hashToken } from "./crypto";

/**
 * Issues a fresh single-use token, revoking any unused tokens of the same type
 * for the user so only the most recent emailed link works.
 */
export async function issueToken(userId: string, type: AuthTokenType, ttlMinutes: number) {
  const token = generateToken();
  await prisma.$transaction([
    prisma.authToken.updateMany({
      where: { userId, type, usedAt: null },
      data: { usedAt: new Date() },
    }),
    prisma.authToken.create({
      data: {
        userId,
        type,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + ttlMinutes * 60_000),
      },
    }),
  ]);
  return token;
}

/** Looks up a token without consuming it (e.g. to render the reset form). */
export async function findValidToken(token: string, type: AuthTokenType) {
  if (!token) return null;
  const record = await prisma.authToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!record || record.type !== type || record.usedAt || record.expiresAt < new Date()) return null;
  return record;
}

/**
 * Atomically marks the token as used. Returns the record only if this call is
 * the one that consumed it, so a token can never be redeemed twice.
 */
export async function consumeToken(token: string, type: AuthTokenType) {
  const record = await findValidToken(token, type);
  if (!record) return null;
  const { count } = await prisma.authToken.updateMany({
    where: { id: record.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  return count === 1 ? record : null;
}

/** True if a token of this type was issued too recently to send another email. */
export async function isOnCooldown(userId: string, type: AuthTokenType, seconds: number) {
  const recent = await prisma.authToken.findFirst({
    where: { userId, type, createdAt: { gt: new Date(Date.now() - seconds * 1000) } },
    select: { id: true },
  });
  return !!recent;
}
