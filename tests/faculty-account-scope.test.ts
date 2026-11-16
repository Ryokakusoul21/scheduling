import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ user: vi.fn(), record: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requireUser: m.user, requireRole: m.user }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { user: { findUnique: m.record } } }));
import { getScope } from "@/lib/permissions/scope";

beforeEach(() => {
  vi.clearAllMocks();
  m.user.mockResolvedValue({ id: "u", name: "Faculty", role: "FACULTY" });
  m.record.mockResolvedValue({ facultyId: "f", faculty: { departmentId: "new-department" }, status: "ACTIVE", archivedAt: null,
    departmentAssignments: [{ departmentId: "old-department", acting: false }, { departmentId: "acting-department", acting: true }], programAssignments: [] });
});
describe("faculty affiliation follows Registrar records", () => {
  it("uses the current faculty department after a transfer instead of stale account affiliations", async () => {
    expect(await getScope()).toMatchObject({ departmentId: "new-department", departmentIds: ["new-department"], actingDepartmentIds: [], role: "FACULTY" });
  });
  it("preserves explicitly administered department-head authority", async () => {
    m.user.mockResolvedValue({ id: "u", name: "Head", role: "HEAD_OF_DEPARTMENT" });
    expect(await getScope()).toMatchObject({ departmentId: "old-department", departmentIds: ["old-department", "acting-department", "new-department"], actingDepartmentIds: ["acting-department"] });
  });
  it("does not infer a department when the linked faculty record has none", async () => {
    m.record.mockResolvedValue({ facultyId: "f", faculty: { departmentId: null }, status: "ACTIVE", archivedAt: null, departmentAssignments: [{ departmentId: "old", acting: false }], programAssignments: [] });
    expect(await getScope()).toMatchObject({ departmentId: null, departmentIds: [] });
  });
});
