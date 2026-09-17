import "server-only";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import type { AppRole } from "@/lib/permissions/roles";

export async function getSession() {
  return auth();
}

export async function requireUser() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return session.user;
}

export async function requireRole(...roles: AppRole[]) {
  const user = await requireUser();
  if (!roles.includes(user.role as AppRole)) redirect("/dashboard");
  return user;
}
