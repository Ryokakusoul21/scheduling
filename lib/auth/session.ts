import "server-only";
import { forbidden, unauthorized } from "next/navigation";
import { auth } from "@/auth";
import type { AppRole } from "@/lib/permissions/roles";

export async function getSession() {
  return auth();
}

/** Route/API guard: signed-in users only. Renders the 401 page (app/unauthorized.tsx) otherwise. */
export async function requireUser() {
  const session = await auth();
  if (!session?.user) unauthorized();
  return session.user;
}

/** RBAC guard: renders the 403 page (app/forbidden.tsx) when the role isn't allowed. */
export async function requireRole(...roles: AppRole[]) {
  const user = await requireUser();
  if (!roles.includes(user.role as AppRole)) forbidden();
  return user;
}
