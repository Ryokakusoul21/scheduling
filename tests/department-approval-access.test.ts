import { describe, expect, it } from "vitest";
import { can, POLICY_ACTIONS, scopeQuery } from "@/lib/permissions/policy";
import { canAccessPath } from "@/lib/permissions/routes";
import { notificationVisibility } from "@/lib/permissions/notifications";
import { allowedHrefsForRole } from "@/components/layout/nav-config";
import { canManageBooking, canReviewOverride } from "@/lib/bookings/plan";

describe("department approval privacy", () => {
  it.each(["SUPER_ADMINISTRATOR", "REGISTRAR"] as const)("denies %s all request and workload-fix permissions", (role) => {
    const user = { id: "admin", role, departmentIds: ["cs"] };
    for (const type of ["scheduleRequest", "workloadFix"] as const) {
      for (const action of POLICY_ACTIONS) expect(can(user, action, { type, departmentId: "cs" })).toBe(false);
      expect(scopeQuery(user, type)).toEqual({ id: { equals: "__denied__" } });
    }
    expect(canAccessPath("/requests", role)).toBe(false);
    expect(allowedHrefsForRole(role)).not.toContain("/requests");
    expect(canReviewOverride({ role, departmentIds: ["cs"] }, "cs")).toBe(false);
    expect(canManageBooking({ ...user, userId: "admin" }, { bookedById: "admin", priority: "REGULAR" })).toBe(false);
    for (const action of POLICY_ACTIONS) expect(can(user, action, { type: "roomBooking" })).toBe(["view", "export"].includes(action));
    expect(notificationVisibility(role)).toMatchObject({ OR: expect.any(Array) });
  });

  it("restricts heads to their departments and prevents self-approval", () => {
    const user = { id: "head", role: "HEAD_OF_DEPARTMENT", departmentIds: ["cs"] };
    for (const type of ["roomBooking", "scheduleRequest", "workloadFix"] as const) {
      expect(can(user, "approve", { type, departmentId: "cs", ownerUserId: "faculty" })).toBe(true);
      expect(can(user, "approve", { type, departmentId: "business", ownerUserId: "faculty" })).toBe(false);
      expect(can(user, "approve", { type, departmentId: "cs", ownerUserId: "head" })).toBe(false);
    }
    expect(canAccessPath("/requests", "HEAD_OF_DEPARTMENT")).toBe(true);
    expect(canAccessPath("/requests", "FACULTY")).toBe(true);
    expect(notificationVisibility("FACULTY")).toEqual({});
  });
});
