import { describe, expect, it } from "vitest";
import { can, POLICY_ACTIONS, scopeQuery, type PolicyResource, type PolicyUser } from "@/lib/permissions/policy";

const own: PolicyResource = { type: "subject", id: "own", departmentId: "computer" };
const other: PolicyResource = { type: "subject", id: "other", departmentId: "business" };
const shared: PolicyResource = { type: "subject", id: "general-education", departmentId: null, shared: true };
const hod: PolicyUser = { id: "hod", role: "HEAD_OF_DEPARTMENT", status: "ACTIVE", departmentIds: ["computer"] };

describe("central permission policy", () => {
  it("lets the Registrar book any department's rooms and shared rooms and manage their own bookings", () => {
    const registrar: PolicyUser = { id: "registrar", role: "REGISTRAR", status: "ACTIVE", departmentIds: [] };
    for (const departmentId of ["computer", "business", null]) {
      const booking: PolicyResource = { type: "roomBooking", departmentId, ownerUserId: registrar.id };
      for (const action of POLICY_ACTIONS) {
        expect(can(registrar, action, booking), action).toBe(["view", "export", "create", "submit", "edit", "archive"].includes(action));
        expect(can(registrar, action, { ...booking, ownerUserId: "someone-else" }), action).toBe(["view", "export"].includes(action));
        expect(can({ ...registrar, status: "INACTIVE" }, action, booking), action).toBe(false);
      }
    }
    expect(scopeQuery(registrar, "room")).toEqual({});
    expect(scopeQuery(registrar, "roomBooking")).toEqual({});
    expect(can({ ...registrar, id: undefined }, "create", { type: "roomBooking" })).toBe(false);
  });

  it("denies unauthenticated and inactive users", () => {
    expect(can(null, "view", own)).toBe(false);
    expect(can({ role: "REGISTRAR", status: "ARCHIVED" }, "edit", own)).toBe(false);
    expect(can({ role: "HEAD_OF_DEPARTMENT", status: "SUSPENDED", departmentIds: ["computer"] }, "view", own)).toBe(false);
  });

  it("allows the Registrar and limits a Head of Department to assigned departments", () => {
    expect(can({ role: "REGISTRAR", status: "ACTIVE" }, "archive", other)).toBe(true);
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

  it("gives department heads operational approvals within their departments", () => {
    expect(can(hod, "approve", { type: "scheduleRequest", departmentId: "computer" })).toBe(true);
    expect(can({ role: "FACULTY", status: "ACTIVE" }, "reject", { type: "roomBooking" })).toBe(false);
  });

  it("routes assignment proposal review through the proposed faculty department", () => {
    const proposal = { type: "subjectAssignmentProposal", departmentId: "computer", ownerUserId: "requester" } as const;
    expect(can(hod, "view", proposal)).toBe(true);
    expect(can(hod, "approve", proposal)).toBe(true);
    expect(can({ ...hod, id: "requester" }, "view", { ...proposal, departmentId: "business" })).toBe(true);
    expect(can(hod, "reject", { ...proposal, departmentId: "business" })).toBe(false);
    expect(can({ ...hod, id: "requester" }, "approve", proposal)).toBe(false);
    expect(can({ ...hod, programIds: ["bsit"] }, "submit", { ...proposal, programId: "bsit" })).toBe(true);
    expect(can({ ...hod, programIds: ["bsit"] }, "submit", { ...proposal, programId: "bsba" })).toBe(false);
    expect(can({ role: "REGISTRAR", status: "ACTIVE" }, "approve", { ...proposal, departmentId: "business" })).toBe(true);
    expect(scopeQuery(hod, "subjectAssignmentProposal")).toEqual({ reviewDepartmentId: { in: ["computer"] } });
  });

  it("keeps faculty information read-only for Heads of Department", () => {
    const faculty: PolicyResource = { type: "faculty", departmentId: "computer" };
    expect(can(hod, "view", faculty)).toBe(true);
    expect(can(hod, "view", { ...faculty, departmentId: "business" })).toBe(false);
    for (const action of ["create", "edit", "archive", "restore", "bulkImport"] as const) expect(can(hod, action, faculty)).toBe(false);
  });

  it("limits Faculty to their own records", () => {
    const faculty = { id: "user-f", role: "FACULTY", status: "ACTIVE", facultyId: "faculty-f" };
    expect(can(faculty, "view", { type: "schedule", facultyId: "faculty-f" })).toBe(true);
    expect(can(faculty, "view", { type: "schedule", facultyId: "faculty-other" })).toBe(false);
    expect(can(faculty, "submit", { type: "scheduleRequest", ownerUserId: "user-f" })).toBe(true);
  });

  it("limits Faculty bookable rooms to their department and shared rooms, and bookings to their own", () => {
    const faculty = { id: "user-f", role: "FACULTY", status: "ACTIVE", departmentIds: ["computer"] };
    expect(scopeQuery(faculty, "room")).toEqual({ OR: [{ departmentId: { in: ["computer"] } }, { departmentId: null }] });
    expect(scopeQuery({ ...faculty, departmentIds: [] }, "room")).toEqual({ OR: [{ departmentId: { in: [] } }, { departmentId: null }] });
    expect(scopeQuery({ ...faculty, status: "INACTIVE" }, "room")).toEqual({ id: { equals: "__denied__" } });
    expect(scopeQuery(faculty, "roomBooking")).toEqual({ bookedById: "user-f" });
    expect(can(faculty, "view", { type: "roomBooking", ownerUserId: "other" })).toBe(false);
    expect(can(faculty, "approve", { type: "roomBooking", ownerUserId: "user-f" })).toBe(false);
  });

  it("limits Students to their own section schedules and examinations", () => {
    const student = { role: "STUDENT", status: "ACTIVE", studentSectionId: "section-a" };
    expect(can(student, "view", { type: "schedule", sectionId: "section-a" })).toBe(true);
    expect(can(student, "view", { type: "examination", sectionId: "section-b" })).toBe(false);
  });

  it("denies room booking data to the Super Administrator", () => {
    const administrator = { role: "SUPER_ADMINISTRATOR", status: "ACTIVE" };
    expect(can(administrator, "view", { type: "roomBooking" })).toBe(false);
    expect(scopeQuery(administrator, "roomBooking")).toEqual({ id: { equals: "__denied__" } });
  });

  it("lets only the Registrar and Head of Department suspend classes, each within scope", () => {
    const own = { type: "classSuspension", departmentId: "computer" } as const;
    const outside = { type: "classSuspension", departmentId: "business" } as const;
    expect(can({ role: "REGISTRAR", status: "ACTIVE" }, "create", outside)).toBe(true);
    expect(can(hod, "create", own)).toBe(true);
    expect(can(hod, "edit", own)).toBe(true);
    expect(can(hod, "create", outside)).toBe(false);
    const administrator = { role: "SUPER_ADMINISTRATOR", status: "ACTIVE" };
    expect(can(administrator, "create", own)).toBe(false);
    expect(can(administrator, "view", own)).toBe(true);
    const faculty = { id: "user-f", role: "FACULTY", status: "ACTIVE", facultyId: "faculty-f" };
    expect(can(faculty, "create", own)).toBe(false);
    expect(can(faculty, "view", own)).toBe(false);
    expect(can({ role: "STUDENT", status: "ACTIVE", studentSectionId: "section-a" }, "create", { ...own, sectionId: "section-a" })).toBe(false);
  });

  it("builds database filters that exclude other departments", () => {
    expect(scopeQuery(hod, "program")).toEqual({ departmentId: { in: ["computer"] } });
    expect(scopeQuery(hod, "subject")).toEqual({ OR: [{ departmentId: { in: ["computer"] } }, { departmentId: null }, { level: "COLLEGE", programId: null }] });
    expect(scopeQuery({ role: "REGISTRAR", status: "ACTIVE" }, "program")).toEqual({});
    expect(scopeQuery(null, "program")).toEqual({ id: { equals: "__denied__" } });
  });
});

describe("program catalog and department rename", () => {
  const program: PolicyResource = { type: "programCatalog", id: "bsit", departmentId: "computer" };
  const foreign: PolicyResource = { type: "programCatalog", id: "bsba", departmentId: "business" };
  const dept = (id: string): PolicyResource => ({ type: "department", id, departmentId: id });
  const admin: PolicyUser = { role: "REGISTRAR", status: "ACTIVE" };

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
  it("allows name and logo branding only in a Head's assigned departments", () => {
    expect(can(hod, "updateBranding", dept("computer"))).toBe(true);
    expect(can(hod, "updateBranding", dept("business"))).toBe(false);
    expect(can({ ...hod, actingDepartmentIds: ["business"] }, "updateBranding", dept("business"))).toBe(true);
    expect(can({ ...hod, departmentIds: [] }, "updateBranding", dept("computer"))).toBe(false);
    expect(can({ ...hod, status: "SUSPENDED" }, "updateBranding", dept("computer"))).toBe(false);
    expect(can(hod, "edit", dept("computer"))).toBe(false);
    for (const role of ["FACULTY", "STUDENT"]) expect(can({ ...hod, role }, "updateBranding", dept("computer"))).toBe(false);
  });
  it("keeps the Registrar unrestricted", () => {
    expect(can(admin, "create", program)).toBe(true);
    expect(can(admin, "rename", dept("business"))).toBe(true);
  });
});
