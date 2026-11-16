import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Scope } from "@/lib/permissions/scope";

const m = vi.hoisted(() => ({ faculty: vi.fn(), room: vi.fn(), assignment: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { faculty: { findUnique: m.faculty }, room: { findUnique: m.room }, subjectAssignment: { findFirst: m.assignment } } }));
vi.mock("@/lib/permissions/scope", () => ({ policyUserFromScope: (s: Scope) => ({ ...s, id: s.userId }) }));
vi.mock("@/lib/scheduler/class-save", () => ({ checkClass: vi.fn(), writeClass: vi.fn() }));
vi.mock("@/lib/notify", () => ({ notifyManagers: vi.fn(), notifyUsers: vi.fn() }));
import { foreignDepartments } from "@/lib/requests/cross-department";

const scope = { userId: "head", role: "HEAD_OF_DEPARTMENT", status: "ACTIVE", archivedAt: null, departmentId: "coics", departmentIds: ["coics"], programIds: ["bsit"], isAdmin: false } as Scope;
const slot = { subjectId: "ge2", sectionId: "s1", semesterId: "first" };
beforeEach(() => {
  vi.resetAllMocks();
  m.faculty.mockResolvedValue({ departmentId: "gened" });
  m.room.mockResolvedValue({ departmentId: "coics" });
  m.assignment.mockResolvedValue({ section: { id: "s1", departmentId: "coics", programId: "bsit", archivedAt: null } });
});
describe("approved assignment to scheduler handoff", () => {
  it("does not ask the faculty department to approve the same assignment again", async () => {
    expect(await foreignDepartments(scope, "teacher", "room", slot)).toEqual([]);
    expect(m.assignment).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ ...slot, facultyId: "teacher", status: "ACTIVE", faculty: { status: "ACTIVE", archivedAt: null } }) }));
  });
  it("keeps pending and unassigned external teachers subject to approval", async () => {
    m.assignment.mockResolvedValue(null);
    expect(await foreignDepartments(scope, "teacher", "room", slot)).toEqual(["gened"]);
  });
  it("does not extend faculty approval to a room belonging to the same external department", async () => {
    m.room.mockResolvedValue({ departmentId: "gened" });
    expect(await foreignDepartments(scope, "teacher", "room", slot)).toEqual(["gened"]);
  });
  it("denies the handoff when the section is outside the head's department or course scope", async () => {
    m.assignment.mockResolvedValue({ section: { id: "s1", departmentId: "other", programId: "bsit", archivedAt: null } });
    expect(await foreignDepartments(scope, "teacher", "room", slot)).toEqual(["gened"]);
  });
});
