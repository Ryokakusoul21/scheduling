import "server-only";
import { forbidden, unauthorized } from "next/navigation";
import { auth } from "@/auth";
import type { AppRole } from "@/lib/permissions/roles";

export async function getSession() {
  return auth();
}

/** Route/API guard: signed-in staff only (students use requireStudent). Renders the 401 or 403 page otherwise. */
export async function requireUser() {
  const session = await auth();
  if (!session?.user) unauthorized();
  if (session.user.role === "STUDENT") forbidden();
  return session.user;
}

/** Guard for the student portal: signed-in students only. */
export async function requireStudent() {
  const session = await auth();
  if (!session?.user) unauthorized();
  if (session.user.role !== "STUDENT") forbidden();
  return session.user;
}

/** RBAC guard: renders the 403 page (app/forbidden.tsx) when the role isn't allowed. */
export async function requireRole(...roles: AppRole[]) {
  const user = await requireUser();
  if (!roles.includes(user.role as AppRole)) forbidden();
  return user;
}
