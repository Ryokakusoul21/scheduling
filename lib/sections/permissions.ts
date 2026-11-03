import type { AppRole } from "@/lib/permissions/roles";
import { canManageSection as policyCanManageSection, canViewSection as policyCanViewSection } from "@/lib/permissions/policy";

export type SectionPermissionUser = { role: AppRole | string; status?: string | null; archivedAt?: Date | string | null; departmentId?: string | null; departmentIds?: readonly string[]; actingDepartmentIds?: readonly string[] };
export type SectionPermissionRecord = { departmentId?: string | null; archivedAt?: Date | string | null };

export function canManageSection(user: SectionPermissionUser, section: SectionPermissionRecord) {
  return policyCanManageSection(user, section);
}

export function canViewSection(user: SectionPermissionUser, section: SectionPermissionRecord) {
  return !section.archivedAt && policyCanViewSection(user, section);
}
