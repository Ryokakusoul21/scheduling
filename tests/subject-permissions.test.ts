import { describe, expect, it } from "vitest";
import { canManageSubject, canViewSubject } from "@/lib/subjects/permissions";

const own = { departmentId: "computer-studies" };
const other = { departmentId: "general-education" };

describe("subject permissions", () => {
  it("allows an active Head of Department to manage an owned subject", () => expect(canManageSubject({ role: "HEAD_OF_DEPARTMENT", status: "ACTIVE", departmentId: "computer-studies" }, own)).toBe(true));
  it("blocks subjects owned by another department", () => expect(canManageSubject({ role: "HEAD_OF_DEPARTMENT", status: "ACTIVE", departmentId: "computer-studies" }, other)).toBe(false));
  it("blocks a General Education subject for another department", () => expect(canManageSubject({ role: "HEAD_OF_DEPARTMENT", status: "ACTIVE", departmentId: "computer-studies" }, other)).toBe(false));
  it("allows the Administrator", () => expect(canManageSubject({ role: "ADMINISTRATOR", status: "ACTIVE" }, other)).toBe(true));
  it.each(["FACULTY", "STUDENT"])("blocks the %s role from managing", (role) => expect(canManageSubject({ role, status: "ACTIVE", departmentId: "computer-studies" }, own)).toBe(false));
  it("blocks an archived user", () => expect(canManageSubject({ role: "ADMINISTRATOR", status: "ACTIVE", archivedAt: new Date() }, own)).toBe(false));
  it("does not expose generic Faculty subject records and hides archived subjects", () => { expect(canViewSubject({ role: "FACULTY", status: "ACTIVE" }, own)).toBe(false); expect(canViewSubject({ role: "FACULTY", status: "ACTIVE" }, { ...own, archivedAt: new Date() })).toBe(false); });
});
