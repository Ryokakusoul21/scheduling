import { beforeEach, describe, expect, it, vi } from "vitest";
import { can, POLICY_ACTIONS } from "@/lib/permissions/policy";
import { canAccessPath } from "@/lib/permissions/routes";
import { canManageBooking, canReviewOverride, maxPriority } from "@/lib/bookings/plan";

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(), findUnique: vi.fn(), checkClass: vi.fn(), updateMany: vi.fn(),
  audit: vi.fn(), students: vi.fn(), transaction: vi.fn(), notify: vi.fn(), revalidate: vi.fn(),
}));
vi.mock("@/lib/auth/session", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { schedule: { findUnique: mocks.findUnique }, $transaction: mocks.transaction } }));
vi.mock("@/lib/scheduler/class-save", () => ({ checkClass: mocks.checkClass, revalidateScheduler: mocks.revalidate }));
vi.mock("@/lib/notify", () => ({ notifyFaculty: mocks.notify, notifyManagers: mocks.notify, notifyUsers: mocks.notify }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/workload/auto", () => ({ queueWorkloadCheck: vi.fn() }));
import { emergencyCorrectionAction } from "@/app/(dashboard)/admin/emergency-access/actions";

const before = {
  id: "class", status: "PUBLISHED", updatedAt: new Date("2026-11-10T00:00:00.000Z"), version: 2,
  departmentId: "department", sectionId: "section", facultyId: "faculty", subjectId: "subject", semesterId: "term",
  roomId: "old-room", dayOfWeek: "MONDAY", startMin: 480, endMin: 540, notes: null, component: "LECTURE",
};
const input = {
  id: "class", updatedAt: before.updatedAt.toISOString(), roomId: "new-room", dayOfWeek: "MONDAY" as const,
  startMin: 480, endMin: 540, reason: "Emergency: the assigned classroom was flooded.", confirmed: true,
};

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
  it("reserves emergency access for the Administrator", () => {
    expect(canAccessPath("/admin/emergency-access", "SUPER_ADMINISTRATOR")).toBe(true);
    for (const role of ["REGISTRAR", "HEAD_OF_DEPARTMENT", "FACULTY", "STUDENT"] as const) expect(canAccessPath("/admin/emergency-access", role)).toBe(false);
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

describe("emergency correction action", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireRole.mockResolvedValue({ id: "admin", role: "SUPER_ADMINISTRATOR" });
    mocks.findUnique.mockResolvedValue(before);
    mocks.checkClass.mockResolvedValue(null);
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.students.mockResolvedValue([{ userId: "student" }]);
    mocks.transaction.mockImplementation(async (callback) => callback({ schedule: { updateMany: mocks.updateMany }, auditLog: { create: mocks.audit }, student: { findMany: mocks.students } }));
  });
  it("authenticates before reading or writing schedule data", async () => {
    mocks.requireRole.mockRejectedValue(new Error("Forbidden"));
    await expect(emergencyCorrectionAction(input)).rejects.toThrow("Forbidden");
    expect(mocks.requireRole).toHaveBeenCalledWith("SUPER_ADMINISTRATOR");
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });
  it.each([
    { reason: "   " }, { confirmed: false }, { startMin: 600, endMin: 500 }, { startMin: -1 },
  ])("rejects invalid emergency details: %j", async (change) => {
    expect(await emergencyCorrectionAction({ ...input, ...change })).toMatchObject({ ok: false });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it.each(["DRAFT", "REVIEW", "ARCHIVED"])("refuses a %s schedule", async (status) => {
    mocks.findUnique.mockResolvedValue({ ...before, status });
    expect(await emergencyCorrectionAction(input)).toMatchObject({ ok: false });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("rejects stale edits and no-op corrections", async () => {
    expect(await emergencyCorrectionAction({ ...input, updatedAt: "2026-11-09T00:00:00.000Z" })).toMatchObject({ ok: false });
    expect(await emergencyCorrectionAction({ ...input, roomId: before.roomId })).toMatchObject({ ok: false });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("keeps scheduling checks active without soft overrides", async () => {
    mocks.checkClass.mockResolvedValue({ ok: false, error: "Room is occupied" });
    expect(await emergencyCorrectionAction(input)).toEqual({ ok: false, error: "Room is occupied" });
    expect(mocks.checkClass).toHaveBeenCalledWith(expect.objectContaining({ id: "class", roomId: "new-room" }), { userId: "admin" }, { overrideSoft: false });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("records actor, reason and before/after placement with the correction in one transaction", async () => {
    expect(await emergencyCorrectionAction(input)).toEqual({ ok: true });
    expect(mocks.updateMany).toHaveBeenCalledWith({ where: { id: "class", updatedAt: before.updatedAt, status: "PUBLISHED" }, data: { roomId: "new-room", dayOfWeek: "MONDAY", startMin: 480, endMin: 540, version: { increment: 1 } } });
    expect(mocks.audit).toHaveBeenCalledWith({ data: expect.objectContaining({ userId: "admin", role: "SUPER_ADMINISTRATOR", reason: input.reason, oldValue: expect.objectContaining({ roomId: "old-room", version: 2 }), newValue: expect.objectContaining({ roomId: "new-room", version: 3 }) }) });
    expect(mocks.notify).toHaveBeenCalledTimes(3);
  });
  it("refuses a schedule changed during validation", async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });
    expect(await emergencyCorrectionAction(input)).toMatchObject({ ok: false });
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.notify).not.toHaveBeenCalled();
  });
  it("propagates audit failure out of the transaction", async () => {
    mocks.audit.mockRejectedValue(new Error("Audit unavailable"));
    await expect(emergencyCorrectionAction(input)).rejects.toThrow("Audit unavailable");
    expect(mocks.notify).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
});
