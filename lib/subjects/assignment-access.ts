import { isActivePolicyUser, policyDepartmentIds, type PolicyUser } from "@/lib/permissions/policy";

/** Assignment authority follows the section and faculty, separately from editing the subject catalog. */
export function facultyAssignmentRoute(user: PolicyUser, facultyDepartmentId: string | null): "DIRECT" | "APPROVAL" | "DENIED" {
  if (!isActivePolicyUser(user)) return "DENIED";
  if (user.role === "REGISTRAR" || user.role === "SUPER_ADMINISTRATOR") return "DIRECT";
  if (user.role !== "HEAD_OF_DEPARTMENT" || !facultyDepartmentId) return "DENIED";
  return policyDepartmentIds(user).includes(facultyDepartmentId) ? "DIRECT" : "APPROVAL";
}
