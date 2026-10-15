/**
 * Route-level RBAC used by the proxy (edge-safe: no Prisma, no React).
 * Pages still call requireRole() as a second line of defense; this map lets the
 * proxy answer with a real 403 before any HTML streams.
 */
import { ADMIN_ROLES, STAFF_ROLES, TEACHING_ROLES, type AppRole } from "./roles";

export const ROUTE_ROLES: { prefix: string; roles: AppRole[] }[] = [
  { prefix: "/admin", roles: ADMIN_ROLES },
  { prefix: "/academic-years", roles: ADMIN_ROLES },
  { prefix: "/programs", roles: STAFF_ROLES },
  { prefix: "/subjects", roles: STAFF_ROLES },
  { prefix: "/sections", roles: STAFF_ROLES },
  { prefix: "/faculty", roles: STAFF_ROLES },
  { prefix: "/rooms", roles: STAFF_ROLES },
  { prefix: "/import", roles: STAFF_ROLES },
  { prefix: "/reports", roles: STAFF_ROLES },
  { prefix: "/analytics", roles: STAFF_ROLES },
  { prefix: "/forecast", roles: STAFF_ROLES },
  { prefix: "/adjustments", roles: STAFF_ROLES },
  { prefix: "/constraints", roles: STAFF_ROLES },
  { prefix: "/availability", roles: TEACHING_ROLES },
];

/** Roles allowed on a path, or null if any signed-in user may open it. */
export function rolesForPath(pathname: string): AppRole[] | null {
  const rule = ROUTE_ROLES.find((r) => pathname === r.prefix || pathname.startsWith(`${r.prefix}/`));
  return rule?.roles ?? null;
}

/** The student portal; students may open nothing else, and staff may not open it. */
export function isStudentArea(pathname: string) {
  return pathname === "/student" || pathname.startsWith("/student/");
}

export function canAccessPath(pathname: string, role: AppRole | undefined) {
  if (role === "STUDENT" || isStudentArea(pathname)) return role === "STUDENT" && isStudentArea(pathname);
  const roles = rolesForPath(pathname);
  return !roles || (!!role && roles.includes(role));
}
