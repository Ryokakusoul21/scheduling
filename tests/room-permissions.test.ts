import { describe, expect, it } from "vitest";
import { can, POLICY_ACTIONS } from "@/lib/permissions/policy";

const head = { id: "head", role: "HEAD_OF_DEPARTMENT", status: "ACTIVE", departmentIds: ["cs"] };
describe("read-only room access for department heads", () => {
  it.each([{ departmentId: "cs" }, { departmentId: null }, { shared: true }])("allows only viewing and exporting visible rooms: %j", (room) => {
    for (const action of POLICY_ACTIONS) expect(can(head, action, { type: "room", ...room }), action).toBe(action === "view" || action === "export");
  });
  it("denies other departments and preserves acting-department read access", () => {
    for (const action of POLICY_ACTIONS) expect(can(head, action, { type: "room", departmentId: "business" })).toBe(false);
    const acting = { ...head, actingDepartmentIds: ["business"] };
    expect(can(acting, "view", { type: "room", departmentId: "business" })).toBe(true);
    expect(can(acting, "edit", { type: "room", departmentId: "business" })).toBe(false);
  });
  it.each(["REGISTRAR", "SUPER_ADMINISTRATOR"])("preserves administrative room management for %s", (role) => {
    for (const action of ["create", "edit", "archive", "restore", "reorder", "bulkImport"] as const) expect(can({ role, status: "ACTIVE" }, action, { type: "room", departmentId: "cs" })).toBe(true);
  });
  it("does not affect using existing rooms to schedule classes or submit bookings", () => {
    expect(can(head, "edit", { type: "schedule", departmentId: "cs" })).toBe(true);
    expect(can(head, "create", { type: "roomBooking", ownerUserId: "head", departmentId: "cs" })).toBe(true);
    expect(can({ ...head, status: "INACTIVE" }, "view", { type: "room", departmentId: "cs" })).toBe(false);
  });
});
