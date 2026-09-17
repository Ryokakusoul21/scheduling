export const ROLES = [
  "SUPER_ADMIN",
  "ADMINISTRATOR",
  "REGISTRAR",
  "SCHEDULER",
  "FACULTY",
  "STUDENT",
] as const;

export type AppRole = (typeof ROLES)[number];

/** Roles that can manage academic structure, rooms, faculty, students, etc. */
export const STAFF_ROLES: AppRole[] = [
  "SUPER_ADMIN",
  "ADMINISTRATOR",
  "REGISTRAR",
  "SCHEDULER",
];

/** Roles that can run the AI scheduler / generate & publish schedules. */
export const SCHEDULING_ROLES: AppRole[] = ["SUPER_ADMIN", "ADMINISTRATOR", "SCHEDULER"];

/** Roles that can manage users and system settings. */
export const ADMIN_ROLES: AppRole[] = ["SUPER_ADMIN", "ADMINISTRATOR"];

export function isStaff(role: AppRole) {
  return STAFF_ROLES.includes(role);
}

export function canManageScheduling(role: AppRole) {
  return SCHEDULING_ROLES.includes(role);
}

export function isAdmin(role: AppRole) {
  return ADMIN_ROLES.includes(role);
}

export function roleLabel(role: AppRole) {
  return role
    .split("_")
    .map((w) => w[0] + w.slice(1).toLowerCase())
    .join(" ");
}
