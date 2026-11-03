import "server-only";
import { randomInt } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { hashToken } from "./crypto";

const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const COUNT = 10;

/** Ten codes shaped like "k3m9x-7qw2d"; shown once, stored only as hashes. */
export function generateRecoveryCodes() {
  const part = () => Array.from({ length: 5 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  return Array.from({ length: COUNT }, () => `${part()}-${part()}`);
}

/** Spaces, dashes and case are ignored so a typed code matches however it was copied. */
export function hashRecoveryCode(code: string) {
  return hashToken(code.toLowerCase().replace(/[^a-z0-9]/g, ""));
}

/** Spends a recovery code if it is unused; false when it is wrong or already used. */
export async function consumeRecoveryCode(userId: string, stored: string[], code: string) {
  const hash = hashRecoveryCode(code);
  if (!stored.includes(hash)) return false;
  const res = await prisma.user.updateMany({
    where: { id: userId, twoFactorRecoveryCodes: { has: hash } },
    data: { twoFactorRecoveryCodes: stored.filter((h) => h !== hash) },
  });
  return res.count === 1;
}
