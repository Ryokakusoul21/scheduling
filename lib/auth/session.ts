import "server-only";
import { cache } from "react";
import { forbidden, unauthorized } from "next/navigation";
import { auth } from "@/auth";
import type { AppRole } from "@/lib/permissions/roles";

/** The session, checked against the database once per request however many components ask for it. */
const currentSession = cache(() => auth());

export async function getSession() {
  return currentSession();
}

/** Route/API guard: signed-in staff only (students use requireStudent). Renders the 401 or 403 page otherwise. */
export async function requireUser() {
  const session = await currentSession();
  if (!session?.user) unauthorized();
  if (session.user.role === "STUDENT") forbidden();
  return session.user;
}

/** Guard for actions any signed-in account may run on its own records (for example, reading notifications). */
export async function requireAccount() {
  const session = await currentSession();
  if (!session?.user) unauthorized();
  return session.user;
}

/** Guard for the student portal: signed-in students only. */
export async function requireStudent() {
  const session = await currentSession();
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
