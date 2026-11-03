import type { AppRole } from "@/lib/permissions/roles";
import { canManageSubject as policyCanManageSubject, canViewSubject as policyCanViewSubject } from "@/lib/permissions/policy";

export type SubjectPermissionUser = {
  role: AppRole | string;
  status?: string | null;
  archivedAt?: Date | string | null;
  departmentId?: string | null;
  departmentIds?: readonly string[];
  actingDepartmentIds?: readonly string[];
};

export type SubjectPermissionRecord = { shared?: boolean; departmentId?: string | null; archivedAt?: Date | string | null };

export function canManageSubject(user: SubjectPermissionUser, subject: SubjectPermissionRecord) {
  return policyCanManageSubject(user, subject);
}

export function canViewSubject(user: SubjectPermissionUser, subject: SubjectPermissionRecord) {
  return !subject.archivedAt && policyCanViewSubject(user, subject);
}
