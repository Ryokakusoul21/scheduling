/**
 * Application-wide, deny-by-default authorization policy.
 *
 * This file deliberately has no server-only or Prisma dependency so the exact
 * same decisions can be used by route handlers, server actions, and React.
 */
export const POLICY_ACTIONS = [
  "view", "create", "edit", "archive", "restore", "reorder", "bulkImport",
  "autoGenerate", "autoSchedule", "submit", "approve", "reject",
  "requestChange", "export", "rename",
] as const;

export type PolicyAction = (typeof POLICY_ACTIONS)[number];

export const POLICY_RESOURCES = [
  "user", "faculty", "department", "program", "subject", "section",
  "schedule", "examination", "activityProposal", "room", "roomBooking",
  "scheduleRequest", "scheduleAdjustment", "workloadFix", "analytics",
  "report", "archive", "auditLog", "settings",
  /** The program and strand records themselves (create, edit, delete, reorder); `program` is the department-level stand-in used by canManageDepartment. */
  "programCatalog",
] as const;

export type PolicyResourceType = (typeof POLICY_RESOURCES)[number];
export type PolicyRole = "SUPER_ADMINISTRATOR" | "REGISTRAR" | "HEAD_OF_DEPARTMENT" | "FACULTY" | "STUDENT";

export interface PolicyUser {
  id?: string;
  role: PolicyRole | string;
  status?: string | null;
  archivedAt?: Date | string | null;
  departmentId?: string | null;
  departmentIds?: readonly string[];
  actingDepartmentIds?: readonly string[];
  /** Active program restriction of a Head of Department; empty or missing means the whole department. */
  programIds?: readonly string[];
  facultyId?: string | null;
  studentSectionId?: string | null;
}

export interface PolicyResource {
  type: PolicyResourceType;
  id?: string | null;
  departmentId?: string | null;
  /** Program or strand of the record (the record's own id for a program); checked when the user is restricted to programs. */
  programId?: string | null;
  ownerUserId?: string | null;
  facultyId?: string | null;
  sectionId?: string | null;
  shared?: boolean;
  archivedAt?: Date | string | null;
}

const DEPARTMENT_MANAGED = new Set<PolicyResourceType>([
  "program", "subject", "section", "schedule", "examination",
  "activityProposal", "scheduleAdjustment", "workloadFix",
]);
const DEPARTMENT_READABLE = new Set<PolicyResourceType>([
  ...DEPARTMENT_MANAGED, "programCatalog", "department", "faculty", "room", "roomBooking", "scheduleRequest",
  "analytics", "report", "auditLog", "archive",
]);
const HOD_MUTATIONS = new Set<PolicyAction>([
  "create", "edit", "archive", "restore", "reorder", "bulkImport",
  "autoGenerate", "autoSchedule", "submit", "requestChange",
]);

export function isActivePolicyUser(user: PolicyUser | null | undefined): user is PolicyUser {
  return !!user && user.status !== "ARCHIVED" && user.status !== "INACTIVE" && user.status !== "SUSPENDED" && !user.archivedAt;
}

export function policyDepartmentIds(user: PolicyUser): string[] {
  return [...new Set([
    ...(user.departmentIds ?? []),
    ...(user.actingDepartmentIds ?? []),
    ...(user.departmentId ? [user.departmentId] : []),
  ].filter(Boolean))];
}

const PROGRAM_SCOPED = new Set<PolicyResourceType>(["program", "programCatalog", "section", "subject", "schedule", "examination", "scheduleAdjustment"]);

/** Head of Department program restriction: records without a program are outside a restricted scope. */
function inProgramScope(user: PolicyUser, resource: PolicyResource) {
  const programs = user.programIds ?? [];
  if (!programs.length || !PROGRAM_SCOPED.has(resource.type)) return true;
  const isProgram = resource.type === "program" || resource.type === "programCatalog";
  const programId = isProgram ? (resource.programId ?? resource.id) : resource.programId;
  // A department-level check on programs (no specific program named) is not narrowed by the restriction.
  if (isProgram && !programId) return true;
  return !!programId && programs.includes(programId);
}

export interface ProgramAssignmentRow {
  programId: string;
  programDepartmentId: string | null;
  startDate: Date;
  endDate: Date | null;
}

/**
 * Programs a Head of Department is restricted to: active rows (today between start and end) whose program
 * belongs to one of their own departments. Empty means no restriction beyond the department.
 */
export function resolveProgramIds(rows: readonly ProgramAssignmentRow[], departmentIds: readonly string[], now = new Date()): string[] {
  return [...new Set(rows
    .filter((r) => r.startDate <= now && (!r.endDate || r.endDate >= now) && !!r.programDepartmentId && departmentIds.includes(r.programDepartmentId))
    .map((r) => r.programId))];
}

function ownsDepartment(user: PolicyUser, resource: PolicyResource) {
  return !!resource.departmentId && policyDepartmentIds(user).includes(resource.departmentId);
}

/** The only authorization decision function. Anything not listed is denied. */
export function can(user: PolicyUser | null | undefined, action: PolicyAction, resource: PolicyResource): boolean {
  if (!isActivePolicyUser(user)) return false;
  if (user.role === "SUPER_ADMINISTRATOR") return true;
  // The Registrar runs every academic record but not accounts, settings, or the audit log.
  if (user.role === "REGISTRAR") return !["user", "settings", "auditLog"].includes(resource.type);

  if (user.role === "HEAD_OF_DEPARTMENT") {
    // Shared resources expose basic availability/details only, never mutations.
    if (action === "view" && resource.shared && ["subject", "room", "faculty"].includes(resource.type)) return true;
    if (action === "requestChange" && ["subject", "room", "faculty", "schedule"].includes(resource.type)) return ownsDepartment(user, resource) || !!resource.shared;
    if (["create", "submit"].includes(action) && resource.type === "roomBooking" && resource.ownerUserId === user.id) return true;
    if (action === "view") return DEPARTMENT_READABLE.has(resource.type) && ownsDepartment(user, resource) && inProgramScope(user, resource);
    if (action === "export") return ["report", "analytics", "schedule", "examination"].includes(resource.type) && ownsDepartment(user, resource) && inProgramScope(user, resource);
    // A Head of Department renames their own department and nothing else about it.
    if (action === "rename") return resource.type === "department" && ownsDepartment(user, resource);
    if (action === "approve" || action === "reject") return false;
    if (resource.type === "faculty" || resource.type === "user" || resource.type === "settings" || resource.type === "roomBooking") return false;
    return HOD_MUTATIONS.has(action) && DEPARTMENT_MANAGED.has(resource.type) && ownsDepartment(user, resource) && inProgramScope(user, resource);
  }

  if (user.role === "FACULTY") {
    const own = (!!resource.ownerUserId && resource.ownerUserId === user.id) || (!!resource.facultyId && resource.facultyId === user.facultyId);
    if (action === "view") return own && ["schedule", "roomBooking", "scheduleRequest", "faculty"].includes(resource.type);
    return own && ["create", "submit", "requestChange"].includes(action) && ["roomBooking", "scheduleRequest"].includes(resource.type);
  }

  if (user.role === "STUDENT" && action === "view") {
    return !!user.studentSectionId && resource.sectionId === user.studentSectionId && ["schedule", "examination", "activityProposal"].includes(resource.type);
  }
  return false;
}

export type PolicyWhere = Record<string, unknown>;

/**
 * Prisma-compatible filter applied before data leaves the repository layer.
 * Callers must additionally apply `can` to stored records before mutation.
 */
export function scopeQuery(user: PolicyUser | null | undefined, type: PolicyResourceType): PolicyWhere {
  if (!isActivePolicyUser(user)) return { id: { equals: "__denied__" } };
  if (user.role === "SUPER_ADMINISTRATOR" || user.role === "REGISTRAR") return {};
  const departments = policyDepartmentIds(user);
  if (user.role === "HEAD_OF_DEPARTMENT") {
    if (!departments.length) return { id: { equals: "__denied__" } };
    const programs = user.programIds ?? [];
    const restricted = programs.length > 0;
    switch (type) {
      case "department": return { id: { in: departments } };
      case "program": return restricted ? { departmentId: { in: departments }, id: { in: programs } } : { departmentId: { in: departments } };
      case "section": return restricted ? { departmentId: { in: departments }, programId: { in: programs } } : { departmentId: { in: departments } };
      case "faculty": case "activityProposal": case "auditLog":
      case "analytics": case "report": case "archive": return { departmentId: { in: departments } };
      case "subject":
        return restricted
          ? { OR: [{ departmentId: { in: departments }, programId: { in: programs } }, { sharedPrograms: { some: { id: { in: programs } } } }, { departmentId: null }, { level: "COLLEGE", programId: null }] }
          : { OR: [{ departmentId: { in: departments } }, { departmentId: null }, { level: "COLLEGE", programId: null }] };
      case "room": return { OR: [{ departmentId: { in: departments } }, { departmentId: null }] };
      case "schedule": case "examination": return { section: restricted ? { departmentId: { in: departments }, programId: { in: programs } } : { departmentId: { in: departments } } };
      case "roomBooking": return { OR: [{ departmentId: { in: departments } }, { room: { departmentId: null } }] };
      case "scheduleRequest": return { OR: [{ departmentId: { in: departments } }, { targetDepartmentId: { in: departments } }] };
      case "scheduleAdjustment": return { schedule: { section: restricted ? { departmentId: { in: departments }, programId: { in: programs } } : { departmentId: { in: departments } } } };
      case "workloadFix": return { departmentId: { in: departments } };
      default: return { id: { equals: "__denied__" } };
    }
  }
  if (user.role === "FACULTY") {
    if (type === "faculty") return { id: user.facultyId ?? "__denied__" };
    if (type === "schedule") return { facultyId: user.facultyId ?? "__denied__" };
    if (type === "roomBooking") return { bookedById: user.id ?? "__denied__" };
    if (type === "scheduleRequest") return { requestedById: user.id ?? "__denied__" };
    return { id: { equals: "__denied__" } };
  }
  if (user.role === "STUDENT" && ["schedule", "examination"].includes(type)) return { sectionId: user.studentSectionId ?? "__denied__" };
  return { id: { equals: "__denied__" } };
}

export function canManageSubject(user: PolicyUser, subject: Omit<PolicyResource, "type">) {
  return can(user, "edit", { ...subject, type: "subject" });
}
export function canViewSubject(user: PolicyUser, subject: Omit<PolicyResource, "type">) {
  return can(user, "view", { ...subject, type: "subject", shared: subject.shared ?? !subject.departmentId });
}
export function canManageSection(user: PolicyUser, section: Omit<PolicyResource, "type">) {
  return can(user, "edit", { ...section, type: "section" });
}
export function canViewSection(user: PolicyUser, section: Omit<PolicyResource, "type">) {
  return can(user, "view", { ...section, type: "section" });
}
export function canViewSchedule(user: PolicyUser, schedule: Omit<PolicyResource, "type">) {
  return can(user, "view", { ...schedule, type: "schedule" });
}
