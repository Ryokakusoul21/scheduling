import "server-only";
import { prisma } from "@/lib/db/prisma";
import { AUTH } from "./config";

export function clientIp(headers: Headers) {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip") ||
    "unknown"
  );
}

/** Too many failed logins from this IP within the window? */
export async function isIpRateLimited(ip: string) {
  const failures = await prisma.loginAttempt.count({
    where: {
      ipAddress: ip,
      success: false,
      createdAt: { gt: new Date(Date.now() - AUTH.ipWindowMinutes * 60_000) },
    },
  });
  return failures >= AUTH.ipMaxFailures;
}

export async function recordLoginAttempt(email: string, ip: string, success: boolean) {
  await prisma.loginAttempt.create({ data: { email, ipAddress: ip, success } });
}

