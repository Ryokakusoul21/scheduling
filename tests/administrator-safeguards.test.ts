import { describe, expect, it } from "vitest";
import { can, POLICY_ACTIONS } from "@/lib/permissions/policy";
import { canManageBooking, canReviewOverride, maxPriority } from "@/lib/bookings/plan";

describe("Administrator role boundaries", () => {
  const admin = { role: "SUPER_ADMINISTRATOR", status: "ACTIVE" };
  it("keeps academic schedules read-only through the routine policy", () => {
    for (const type of ["schedule", "examination", "scheduleAdjustment", "activityProposal"] as const) {
      for (const action of POLICY_ACTIONS) expect(can(admin, action, { type })).toBe(["view", "export"].includes(action));
    }
  });
  it("retains account management and system configuration", () => {
    for (const type of ["user", "settings", "room"] as const) expect(can(admin, "edit", { type })).toBe(true);
    expect(can(admin, "view", { type: "auditLog" })).toBe(true);
  });
  it("prevents Administrator bookings from displacing classes", () => {
    expect(maxPriority("SUPER_ADMINISTRATOR")).toBe("REGULAR");
    expect(maxPriority("REGISTRAR")).toBe("CRITICAL");
  });
  it("blocks urgent booking decisions and restoration through Administrator booking controls", () => {
    const actor = { role: "SUPER_ADMINISTRATOR", userId: "admin", departmentIds: ["department"] };
    expect(canReviewOverride(actor, "department")).toBe(false);
    for (const priority of ["URGENT", "CRITICAL"]) expect(canManageBooking(actor, { bookedById: "admin", priority })).toBe(false);
    expect(canManageBooking(actor, { bookedById: "admin", priority: "REGULAR" })).toBe(false);
    expect(canReviewOverride({ ...actor, role: "REGISTRAR" }, "department")).toBe(false);
    expect(canReviewOverride({ ...actor, role: "HEAD_OF_DEPARTMENT" }, "department")).toBe(true);
    expect(canReviewOverride({ ...actor, role: "FACULTY" }, "department")).toBe(false);
  });
});
