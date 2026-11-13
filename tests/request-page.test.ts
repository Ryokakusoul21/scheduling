import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ role: "FACULTY", facultyId: "faculty" as string | null, requests: vi.fn(), schedules: vi.fn(), rooms: vi.fn(), faculty: vi.fn(), scopeFilter: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: { scheduleRequest: { findMany: m.requests }, schedule: { findMany: m.schedules }, room: { findMany: m.rooms }, faculty: { findMany: m.faculty } } }));
vi.mock("@/lib/permissions/scope", () => ({ requireScope: async (...roles: string[]) => {
  if (!roles.includes(m.role)) throw Error("FORBIDDEN");
  return { role: m.role, userId: "user", facultyId: m.facultyId, departmentId: "cs", departmentIds: ["cs"], isAdmin: false, name: "User" };
} }));
vi.mock("@/lib/permissions/department", () => ({ departmentWhere: { schedule: m.scopeFilter } }));
vi.mock("@/lib/workload/load", () => ({ loadWorkload: vi.fn() }));
vi.mock("@/lib/workload/auto", () => ({ activeTermIds: vi.fn() }));
vi.mock("@/app/(dashboard)/requests/manager", () => ({ RequestsManager: () => null }));
import RequestsPage from "@/app/(dashboard)/requests/page";

describe("Requests page role and record scoping", () => {
  beforeEach(() => { vi.clearAllMocks(); m.role = "FACULTY"; m.facultyId = "faculty"; for (const mock of [m.requests, m.schedules, m.rooms, m.faculty]) mock.mockResolvedValue([]); m.scopeFilter.mockReturnValue({ section: { departmentId: { in: ["cs"] } } }); });
  it.each(["SUPER_ADMINISTRATOR", "REGISTRAR"])("refuses %s before loading any requests", async (role) => {
    m.role = role; await expect(RequestsPage()).rejects.toThrow("FORBIDDEN");
    expect(m.requests).not.toHaveBeenCalled(); expect(m.schedules).not.toHaveBeenCalled();
  });
  it("shows faculty only their own requests and teaching assignments", async () => {
    const page = await RequestsPage();
    expect(page.props.title).toBe("My Change Requests");
    expect(m.requests).toHaveBeenCalledWith(expect.objectContaining({ where: { requestedById: "user" } }));
    expect(m.schedules).toHaveBeenCalledWith(expect.objectContaining({ where: { AND: [{ facultyId: "faculty" }, { status: { not: "ARCHIVED" } }] } }));
    expect(m.scopeFilter).not.toHaveBeenCalled();
  });
  it("gives an unlinked faculty account no teaching assignments", async () => {
    m.facultyId = null; await RequestsPage();
    expect(m.schedules).toHaveBeenCalledWith(expect.objectContaining({ where: { AND: [{ facultyId: "__none__" }, { status: { not: "ARCHIVED" } }] } }));
  });
  it("uses the head's assigned department/program scope for the class picker", async () => {
    m.role = "HEAD_OF_DEPARTMENT"; const page = await RequestsPage();
    expect(page.props.title).toBe("Department Requests"); expect(m.scopeFilter).toHaveBeenCalled();
    expect(m.schedules).toHaveBeenCalledWith(expect.objectContaining({ where: { AND: [{ section: { departmentId: { in: ["cs"] } } }, { status: { not: "ARCHIVED" } }] } }));
  });
});
