import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Scope } from "@/lib/permissions/scope";

const m = vi.hoisted(() => ({ role: "FACULTY", departments: ["cs"], require: vi.fn(), schedule: vi.fn(), find: vi.fn(), create: vi.fn(), update: vi.fn(), audit: vi.fn(), managers: vi.fn(), users: vi.fn(), blocked: vi.fn(), departmentSchedule: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/permissions/scope", () => ({ requireScope: m.require }));
vi.mock("@/lib/permissions/department", () => ({ departmentWhere: { schedule: m.departmentSchedule }, logBlocked: m.blocked }));
vi.mock("@/lib/notify", () => ({ notifyManagers: m.managers, notifyUsers: m.users }));
vi.mock("@/lib/workload/auto", () => ({ queueWorkloadCheck: vi.fn() }));
vi.mock("@/lib/requests/cross-department", () => ({ applyCrossDepartment: vi.fn() }));
vi.mock("@/lib/requests/faculty-change", () => ({ applyFacultyChange: vi.fn(), describeChanges: vi.fn(), facultyChangeSchema: {} }));
vi.mock("@/lib/db/prisma", () => ({ prisma: {
  schedule: { findFirst: m.schedule }, room: { findFirst: async () => ({ roomNumber: "102", roomName: "Room 102" }) }, faculty: { findFirst: vi.fn() },
  scheduleRequest: { findUnique: m.find, create: m.create, updateMany: m.update }, auditLog: { create: m.audit },
} }));
import { createRequestAction, reviewRequestAction, cancelRequestAction, updateRequestAction } from "@/app/(dashboard)/requests/actions";

const input = { type: "CHANGE_ROOM" as const, scheduleId: "class", requestedRoomId: "room", reason: "A larger classroom is needed." };
const request = { id: "request", status: "PENDING", type: "CHANGE_ROOM", requestedById: "teacher", requestedBy: { role: "FACULTY" }, departmentId: "cs", targetDepartmentId: null, updatedAt: new Date("2026-11-13T08:00:00Z"), details: {} };

describe("faculty requests and department status management", () => {
  beforeEach(() => {
    vi.clearAllMocks(); m.role = "FACULTY"; m.departments = ["cs"];
    m.require.mockImplementation(async (...roles: string[]) => {
      if (!roles.includes(m.role)) throw Error("FORBIDDEN");
      return { role: m.role, userId: m.role === "FACULTY" ? "teacher" : "head", name: "User", facultyId: "faculty", departmentId: "cs", manageDepartmentId: "cs", departmentIds: m.departments, actingDepartmentIds: [], programIds: [], isAdmin: false, status: "ACTIVE", archivedAt: null } as Scope;
    });
    m.schedule.mockResolvedValue({ dayOfWeek: "MONDAY", startMin: 480, endMin: 570, section: { departmentId: "cs" }, room: { roomNumber: "101", roomName: "Room 101" }, faculty: { fullName: "Teacher" } });
    m.create.mockResolvedValue({ id: "request" }); m.find.mockResolvedValue(request); m.update.mockResolvedValue({ count: 1 });
    m.departmentSchedule.mockReturnValue({ section: { departmentId: { in: ["cs"] } } });
  });

  it("lets faculty submit for their own class and notifies the department responsible for it", async () => {
    expect(await createRequestAction(input)).toEqual({ ok: true, id: "request" });
    expect(m.schedule).toHaveBeenCalledWith(expect.objectContaining({ where: { AND: [{ id: "class", status: { not: "ARCHIVED" } }, { facultyId: "faculty" }] } }));
    expect(m.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ requestedById: "teacher", departmentId: "cs" }) }));
    expect(m.managers).toHaveBeenCalledWith("cs", expect.objectContaining({ link: "/requests" }));
  });

  it("refuses another teacher's or archived class even within the same department", async () => {
    m.schedule.mockResolvedValue(null);
    expect(await createRequestAction(input)).toMatchObject({ ok: false });
    expect(m.create).not.toHaveBeenCalled(); expect(m.managers).not.toHaveBeenCalled();
  });

  it("routes a shared teaching assignment to its owning department", async () => {
    const row = await m.schedule(); m.schedule.mockResolvedValue({ ...row, section: { departmentId: "business" } });
    expect((await createRequestAction(input)).ok).toBe(true);
    expect(m.managers).toHaveBeenCalledWith("business", expect.objectContaining({ link: "/requests" }));
  });

  it.each(["SUPER_ADMINISTRATOR", "REGISTRAR"])("rejects %s at the action boundary before reading request data", async (role) => {
    m.role = role;
    await expect(createRequestAction(input)).rejects.toThrow("FORBIDDEN");
    await expect(reviewRequestAction("request", "APPROVED")).rejects.toThrow("FORBIDDEN");
    await expect(cancelRequestAction("request")).rejects.toThrow("FORBIDDEN");
    await expect(updateRequestAction("request", input)).rejects.toThrow("FORBIDDEN");
    expect(m.find).not.toHaveBeenCalled(); expect(m.schedule).not.toHaveBeenCalled(); expect(m.create).not.toHaveBeenCalled(); expect(m.update).not.toHaveBeenCalled();
  });

  it("does not let faculty change statuses or edit submitted requests", async () => {
    await expect(reviewRequestAction("request", "APPROVED")).rejects.toThrow("FORBIDDEN");
    await expect(cancelRequestAction("request")).rejects.toThrow("FORBIDDEN");
    await expect(updateRequestAction("request", input)).rejects.toThrow("FORBIDDEN");
    expect(m.find).not.toHaveBeenCalled();
  });

  it("allows the owning head to approve and notifies the requesting faculty", async () => {
    m.role = "HEAD_OF_DEPARTMENT";
    expect(await reviewRequestAction("request", "APPROVED", "Approved")).toEqual({ ok: true });
    expect(m.update).toHaveBeenCalledWith({ where: { id: "request", status: "PENDING", updatedAt: request.updatedAt }, data: { status: "APPROVED", reviewNote: "Approved", reviewedById: "head" } });
    expect(m.users).toHaveBeenCalledWith(["teacher"], expect.objectContaining({ title: "Request approved" }));
  });

  it("rejects foreign-department decisions and self-approval", async () => {
    m.role = "HEAD_OF_DEPARTMENT"; m.departments = ["business"];
    expect(await reviewRequestAction("request", "APPROVED")).toMatchObject({ ok: false });
    m.departments = ["cs"]; m.find.mockResolvedValue({ ...request, requestedById: "head" });
    expect(await reviewRequestAction("request", "APPROVED")).toMatchObject({ ok: false });
    expect(m.update).not.toHaveBeenCalled();
  });

  it("requires a rejection reason and rejects forged status values", async () => {
    m.role = "HEAD_OF_DEPARTMENT";
    expect(await reviewRequestAction("request", "REJECTED", "No")).toMatchObject({ ok: false });
    expect(await reviewRequestAction("request", "COMPLETED" as "APPROVED")).toMatchObject({ ok: false });
    expect(m.find).not.toHaveBeenCalled(); expect(m.update).not.toHaveBeenCalled();
    expect(await reviewRequestAction("request", "REJECTED", "Room is unavailable")).toEqual({ ok: true });
  });

  it("does not overwrite a decision made during another review", async () => {
    m.role = "HEAD_OF_DEPARTMENT"; m.update.mockResolvedValue({ count: 0 });
    expect(await reviewRequestAction("request", "APPROVED")).toMatchObject({ ok: false, error: expect.stringContaining("Refresh") });
    expect(m.audit).not.toHaveBeenCalled(); expect(m.users).not.toHaveBeenCalled();
  });

  it("records the head who cancels a faculty request", async () => {
    m.role = "HEAD_OF_DEPARTMENT";
    expect(await cancelRequestAction("request")).toEqual({ ok: true });
    expect(m.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: "CANCELLED", reviewedById: "head" } }));
    expect(m.users).toHaveBeenCalledWith(["teacher"], expect.objectContaining({ title: "Your request was cancelled" }));
  });
});
