import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Scope } from "@/lib/permissions/scope";

const mocks = vi.hoisted(() => ({ room: vi.fn(), create: vi.fn(), audit: vi.fn(), notify: vi.fn(), plan: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: { room: { findFirst: mocks.room }, roomBooking: { create: mocks.create }, auditLog: { create: mocks.audit } } }));
vi.mock("@/lib/permissions/department", () => ({ departmentWhere: { room: () => ({}) }, logBlocked: vi.fn() }));
vi.mock("@/lib/settings", () => ({ getBookingSettings: vi.fn(async () => ({})) }));
vi.mock("@/lib/notify", () => ({ notifyManagers: mocks.notify, notifyUsers: vi.fn(), notifyFacultyEach: vi.fn() }));
vi.mock("@/lib/email/mailer", () => ({ sendMail: vi.fn() }));
vi.mock("@/lib/occupancy/load", () => ({ loadPlan: vi.fn(async () => ({})) }));
vi.mock("@/lib/occupancy/adjust", () => ({ undoProblems: vi.fn(), writePlan: vi.fn() }));
vi.mock("@/lib/workload/auto", () => ({ queueWorkloadCheck: vi.fn() }));
vi.mock("@/lib/bookings/plan", async (original) => ({ ...await original<object>(), planBooking: mocks.plan }));

import { createBooking } from "@/lib/bookings/service";

const input = { roomId: "room", priority: "REGULAR" as const, purpose: "Department meeting", date: "2026-11-12", startMin: 480, endMin: 540, attendees: 10 };
const scope = { userId: "faculty", name: "Faculty", role: "FACULTY", departmentId: "cs", departmentIds: ["cs"], isAdmin: false } as Scope;

describe("room booking department approval", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.room.mockResolvedValue({ id: "room", roomName: "Meeting room", departmentId: "cs" });
    mocks.create.mockResolvedValue({ id: "booking" });
    mocks.plan.mockReturnValue({ blockers: [], items: [], displaced: [] });
  });

  it("leaves regular bookings pending and routes them to the room's department", async () => {
    expect(await createBooking(scope, input)).toMatchObject({ ok: true, status: "AWAITING_APPROVAL" });
    expect(mocks.create).toHaveBeenCalledWith({ data: expect.objectContaining({ approvalDepartmentId: "cs", status: "AWAITING_APPROVAL" }) });
    expect(mocks.notify).toHaveBeenCalledWith("cs", expect.objectContaining({ link: "/bookings?booking=booking" }));
  });

  it("routes shared rooms to the requester's department", async () => {
    mocks.room.mockResolvedValue({ id: "room", roomName: "Shared room", departmentId: null });
    expect(await createBooking(scope, input)).toMatchObject({ ok: true, status: "AWAITING_APPROVAL" });
    expect(mocks.create).toHaveBeenCalledWith({ data: expect.objectContaining({ approvalDepartmentId: "cs" }) });
  });

  it.each(["REGISTRAR", "SUPER_ADMINISTRATOR"] as const)("blocks %s from creating bookings before reading room data", async (role) => {
    expect(await createBooking({ ...scope, role, isAdmin: true }, input)).toMatchObject({ ok: false });
    expect(mocks.room).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("requires a responsible department for shared rooms", async () => {
    mocks.room.mockResolvedValue({ id: "room", roomName: "Shared room", departmentId: null });
    expect(await createBooking({ ...scope, departmentId: null }, input)).toMatchObject({ ok: false });
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
