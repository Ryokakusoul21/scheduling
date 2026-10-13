export const ROLES = ["ADMINISTRATOR", "HEAD_OF_DEPARTMENT", "FACULTY"] as const;

export type AppRole = (typeof ROLES)[number];

/** Roles that manage academic structure, rooms, faculty, and schedules (Head of Department within their department). */
export const STAFF_ROLES: AppRole[] = ["ADMINISTRATOR", "HEAD_OF_DEPARTMENT"];

/** Roles that can build timetables and run automatic adjustments. */
export const SCHEDULING_ROLES: AppRole[] = ["ADMINISTRATOR", "HEAD_OF_DEPARTMENT"];

/** Roles whose schedule edits apply immediately, with no review step. */
export const DIRECT_EDIT_ROLES: AppRole[] = ["ADMINISTRATOR"];

/** Roles that approve and publish schedules and workload reassignments. */
export const PUBLISH_ROLES: AppRole[] = ["ADMINISTRATOR", "HEAD_OF_DEPARTMENT"];

/** Roles that manage users, every department, and system settings. */
export const ADMIN_ROLES: AppRole[] = ["ADMINISTRATOR"];

/** Roles that teach classes and so have their own load and can report unavailability. */
export const TEACHING_ROLES: AppRole[] = ["HEAD_OF_DEPARTMENT", "FACULTY"];

export const ROLE_LABELS: Record<AppRole, string> = {
  ADMINISTRATOR: "Administrator",
  HEAD_OF_DEPARTMENT: "Head of Department",
  FACULTY: "Faculty",
};

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
  return ROLE_LABELS[role] ?? role;
}

/** Landing page after sign-in; the dashboard is tailored to each role. */
export const HOME_PATH = "/dashboard";
