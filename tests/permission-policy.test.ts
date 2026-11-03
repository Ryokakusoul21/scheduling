import { describe, expect, it } from "vitest";
import { can, scopeQuery, type PolicyResource, type PolicyUser } from "@/lib/permissions/policy";

const own: PolicyResource = { type: "subject", id: "own", departmentId: "computer" };
const other: PolicyResource = { type: "subject", id: "other", departmentId: "business" };
const shared: PolicyResource = { type: "subject", id: "general-education", departmentId: null, shared: true };
const hod: PolicyUser = { id: "hod", role: "HEAD_OF_DEPARTMENT", status: "ACTIVE", departmentIds: ["computer"] };

describe("central permission policy", () => {
  it("denies unauthenticated and inactive users", () => {
    expect(can(null, "view", own)).toBe(false);
    expect(can({ role: "ADMINISTRATOR", status: "ARCHIVED" }, "edit", own)).toBe(false);
    expect(can({ role: "HEAD_OF_DEPARTMENT", status: "SUSPENDED", departmentIds: ["computer"] }, "view", own)).toBe(false);
  });

  it("allows the Administrator and limits a Head of Department to assigned departments", () => {
    expect(can({ role: "ADMINISTRATOR", status: "ACTIVE" }, "archive", other)).toBe(true);
    expect(can(hod, "edit", own)).toBe(true);
    expect(can(hod, "edit", other)).toBe(false);
    expect(can(hod, "view", other)).toBe(false);
  });

  it("supports a currently active acting department supplied by the server scope", () => {
    const acting = { ...hod, actingDepartmentIds: ["business"] };
    expect(can(acting, "edit", other)).toBe(true);
  });

  it("keeps shared resources read-only and permits requesting a change", () => {
    expect(can(hod, "view", shared)).toBe(true);
    expect(can(hod, "edit", shared)).toBe(false);
    expect(can(hod, "requestChange", shared)).toBe(true);
  });

  it("reserves every approval and rejection for the Administrator", () => {
    expect(can(hod, "approve", { type: "scheduleRequest", departmentId: "computer" })).toBe(false);
    expect(can({ role: "FACULTY", status: "ACTIVE" }, "reject", { type: "roomBooking" })).toBe(false);
  });

  it("limits Faculty to their own records", () => {
    const faculty = { id: "user-f", role: "FACULTY", status: "ACTIVE", facultyId: "faculty-f" };
    expect(can(faculty, "view", { type: "schedule", facultyId: "faculty-f" })).toBe(true);
    expect(can(faculty, "view", { type: "schedule", facultyId: "faculty-other" })).toBe(false);
    expect(can(faculty, "submit", { type: "scheduleRequest", ownerUserId: "user-f" })).toBe(true);
  });

  it("limits Students to their own section schedules and examinations", () => {
    const student = { role: "STUDENT", status: "ACTIVE", studentSectionId: "section-a" };
    expect(can(student, "view", { type: "schedule", sectionId: "section-a" })).toBe(true);
    expect(can(student, "view", { type: "examination", sectionId: "section-b" })).toBe(false);
  });

  it("builds database filters that exclude other departments", () => {
    expect(scopeQuery(hod, "program")).toEqual({ departmentId: { in: ["computer"] } });
    expect(scopeQuery(hod, "subject")).toEqual({ OR: [{ departmentId: { in: ["computer"] } }, { departmentId: null }] });
    expect(scopeQuery({ role: "ADMINISTRATOR", status: "ACTIVE" }, "program")).toEqual({});
    expect(scopeQuery(null, "program")).toEqual({ id: { equals: "__denied__" } });
  });
});

describe("program catalog and department rename", () => {
  const program: PolicyResource = { type: "programCatalog", id: "bsit", departmentId: "computer" };
  const foreign: PolicyResource = { type: "programCatalog", id: "bsba", departmentId: "business" };
  const dept = (id: string): PolicyResource => ({ type: "department", id, departmentId: id });
  const admin: PolicyUser = { role: "ADMINISTRATOR", status: "ACTIVE" };

  it("lets a Head of Department view own programs but never change them", () => {
    expect(can(hod, "view", program)).toBe(true);
    expect(can(hod, "view", foreign)).toBe(false);
    for (const action of ["create", "edit", "archive", "reorder"] as const) expect(can(hod, action, program)).toBe(false);
  });
  it("lets a Head of Department rename only their own department", () => {
    expect(can(hod, "rename", dept("computer"))).toBe(true);
    expect(can(hod, "rename", dept("business"))).toBe(false);
    expect(can({ role: "FACULTY", status: "ACTIVE", departmentId: "computer" }, "rename", dept("computer"))).toBe(false);
  });
  it("keeps the Administrator unrestricted", () => {
    expect(can(admin, "create", program)).toBe(true);
    expect(can(admin, "rename", dept("business"))).toBe(true);
  });
});
