import { describe, expect, it } from "vitest";
import { canManageSection, canViewSection } from "@/lib/sections/permissions";

describe("section permissions", () => {
  const own = { departmentId: "computer-studies" };
  it("allows an active Head of Department in the owning department", () => expect(canManageSection({ role: "HEAD_OF_DEPARTMENT", status: "ACTIVE", departmentId: "computer-studies" }, own)).toBe(true));
  it("blocks another department", () => expect(canManageSection({ role: "HEAD_OF_DEPARTMENT", status: "ACTIVE", departmentId: "business" }, own)).toBe(false));
  it("allows the Registrar", () => expect(canManageSection({ role: "REGISTRAR", status: "ACTIVE" }, own)).toBe(true));
  it.each(["FACULTY", "STUDENT"])("blocks %s from managing", (role) => expect(canManageSection({ role, status: "ACTIVE", departmentId: "computer-studies" }, own)).toBe(false));
  it("blocks archived users", () => expect(canManageSection({ role: "HEAD_OF_DEPARTMENT", status: "ACTIVE", archivedAt: new Date(), departmentId: "computer-studies" }, own)).toBe(false));
  it("does not expose a generic section record to Faculty", () => expect(canViewSection({ role: "FACULTY", status: "ACTIVE" }, own)).toBe(false));
});
