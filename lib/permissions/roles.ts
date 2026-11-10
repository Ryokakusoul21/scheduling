export const ROLES = ["SUPER_ADMINISTRATOR", "REGISTRAR", "HEAD_OF_DEPARTMENT", "FACULTY", "STUDENT"] as const;

export type AppRole = (typeof ROLES)[number];

/** Roles that manage academic structure, rooms, faculty, and schedules (Head of Department within their department). */
export const STAFF_ROLES: AppRole[] = ["SUPER_ADMINISTRATOR", "REGISTRAR", "HEAD_OF_DEPARTMENT"];

/** Roles that can work on timetable construction or resolution. */
export const SCHEDULING_ROLES: AppRole[] = ["REGISTRAR", "HEAD_OF_DEPARTMENT"];

/** Routine timetable changes always go through department submission and Registrar review. */
export const DIRECT_EDIT_ROLES: AppRole[] = [];

/** Only the Registrar approves and publishes department-submitted schedules. */
export const PUBLISH_ROLES: AppRole[] = ["REGISTRAR"];

/** Roles with school-wide access to every department, term, room, schedule, and report. */
export const ADMIN_ROLES: AppRole[] = ["SUPER_ADMINISTRATOR", "REGISTRAR"];

/** Roles that manage user accounts, system settings, and audit logs. */
export const SUPER_ROLES: AppRole[] = ["SUPER_ADMINISTRATOR"];

/** Roles that teach classes and so have their own load and can report unavailability. */
export const TEACHING_ROLES: AppRole[] = ["HEAD_OF_DEPARTMENT", "FACULTY"];

export const ROLE_LABELS: Record<AppRole, string> = {
  SUPER_ADMINISTRATOR: "Administrator",
  REGISTRAR: "Registrar",
  HEAD_OF_DEPARTMENT: "Head of Department",
  FACULTY: "Faculty",
  STUDENT: "Student",
};

export function isStaff(role: AppRole) {
  return STAFF_ROLES.includes(role);
}

export function canManageScheduling(role: AppRole) {
  return SCHEDULING_ROLES.includes(role);
}

export function isAdmin(role: AppRole | string | undefined) {
  return ADMIN_ROLES.includes(role as AppRole);
}

export function isSuperRegistrar(role: AppRole | string | undefined) {
  return role === "SUPER_ADMINISTRATOR";
}

export function roleLabel(role: AppRole) {
  return ROLE_LABELS[role] ?? role;
}

/** Landing page after sign-in; the dashboard is tailored to each role. */
export const HOME_PATH = "/dashboard";

/** Students have their own view-only portal, separate from the staff dashboard. */
export const STUDENT_HOME_PATH = "/student";

export function homePath(role: string | undefined) {
  return role === "STUDENT" ? STUDENT_HOME_PATH : HOME_PATH;
}
