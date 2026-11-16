import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Scope } from "@/lib/permissions/scope";

const mocks = vi.hoisted(() => ({ room: vi.fn(), rooms: vi.fn(), departments: vi.fn(), create: vi.fn(), audit: vi.fn(), notify: vi.fn(), plan: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: { room: { findFirst: mocks.room, findMany: mocks.rooms }, department: { findMany: mocks.departments }, roomBooking: { create: mocks.create }, auditLog: { create: mocks.audit } } }));
vi.mock("@/lib/permissions/department", async (original) => ({ ...await original<object>(), logBlocked: vi.fn() }));
vi.mock("@/lib/settings", () => ({ getBookingSettings: vi.fn(async () => ({})) }));
vi.mock("@/lib/notify", () => ({ notifyManagers: mocks.notify, notifyUsers: vi.fn(), notifyFacultyEach: vi.fn() }));
vi.mock("@/lib/email/mailer", () => ({ sendMail: vi.fn() }));
vi.mock("@/lib/occupancy/load", () => ({ loadPlan: vi.fn(async () => ({ ctx: { occupants: [] } })) }));
vi.mock("@/lib/occupancy/adjust", () => ({ undoProblems: vi.fn(), writePlan: vi.fn() }));
vi.mock("@/lib/workload/auto", () => ({ queueWorkloadCheck: vi.fn() }));
vi.mock("@/lib/bookings/plan", async (original) => ({ ...await original<object>(), planBooking: mocks.plan }));

import { createBooking, searchRooms } from "@/lib/bookings/service";

const input = { roomId: "room", priority: "REGULAR" as const, purpose: "Department meeting", date: "2026-11-12", startMin: 480, endMin: 540, attendees: 10 };
const scope = { userId: "faculty", name: "Faculty", role: "FACULTY", status: "ACTIVE", departmentId: "cs", departmentIds: ["cs"], isAdmin: false } as Scope;
const registrar = { ...scope, userId: "registrar", role: "REGISTRAR", isAdmin: true, manageDepartmentId: null } as Scope;

describe("room booking department approval", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.room.mockResolvedValue({ id: "room", roomName: "Meeting room", departmentId: "cs" });
    mocks.create.mockResolvedValue({ id: "booking" });
    mocks.plan.mockReturnValue({ blockers: [], items: [], displaced: [], notes: [] });
    mocks.departments.mockResolvedValue([{ id: "business", name: "Business" }]);
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

  it("uses the same room identity in search results and approval notifications", async () => {
    const room = { id: "room", roomNumber: "GA-303", roomName: "Lecture room", departmentId: "cs", capacity: 40, roomType: "LECTURE_ROOM", equipment: [], floor: null };
    mocks.rooms.mockResolvedValue([room]);
    mocks.room.mockResolvedValue(room);
    const result = await searchRooms(scope, input);
    expect(result.options[0].name).toBe("GA-303 · Lecture room");
    await createBooking(scope, input);
    expect(mocks.notify).toHaveBeenCalledWith("cs", expect.objectContaining({ message: expect.stringContaining("GA-303 · Lecture room") }));
  });

  it("limits Faculty room searches and booking requests to department and shared rooms", async () => {
    mocks.rooms.mockResolvedValue([]);
    const roomScope = { OR: [{ departmentId: { in: ["cs"] } }, { departmentId: null }] };
    await searchRooms(scope, { ...input, roomId: undefined });
    expect(mocks.rooms).toHaveBeenCalledWith(expect.objectContaining({ where: { archivedAt: null, ...roomScope } }));
    await createBooking(scope, input);
    expect(mocks.room).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "room", archivedAt: null, ...roomScope } }));
  });

  it("rejects a Faculty booking of a room outside the allowed scope", async () => {
    mocks.room.mockResolvedValue(null);
    expect(await createBooking(scope, input)).toMatchObject({ ok: false, error: expect.stringContaining("not available to your department") });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it.each(["HIGH", "URGENT", "CRITICAL"] as const)("prevents Faculty from bypassing room scope with %s priority", async (priority) => {
    expect(await searchRooms(scope, { ...input, priority })).toEqual({ options: [], caps: null });
    expect(await createBooking(scope, { ...input, priority })).toMatchObject({ ok: false });
    expect(mocks.rooms).not.toHaveBeenCalled();
    expect(mocks.room).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("blocks the Super Administrator from creating bookings before reading room data", async () => {
    expect(await createBooking({ ...scope, role: "SUPER_ADMINISTRATOR", isAdmin: true }, input)).toMatchObject({ ok: false });
    expect(mocks.room).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("requires a responsible department for shared rooms", async () => {
    mocks.room.mockResolvedValue({ id: "room", roomName: "Shared room", departmentId: null });
    expect(await createBooking({ ...scope, departmentId: null }, input)).toMatchObject({ ok: false });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it.each(["cs", "business", null])("lets the Registrar request a room owned by %s and retains department approval", async (departmentId) => {
    mocks.room.mockResolvedValue({ id: "room", roomName: "Meeting room", departmentId });
    expect(await createBooking(registrar, input)).toMatchObject({ ok: true, status: "AWAITING_APPROVAL" });
    expect(mocks.room).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "room", archivedAt: null } }));
    expect(mocks.create).toHaveBeenCalledWith({ data: expect.objectContaining({ bookedById: "registrar", approvalDepartmentId: departmentId ?? "cs", status: "AWAITING_APPROVAL" }) });
    expect(mocks.notify).toHaveBeenCalledWith(departmentId ?? "cs", expect.anything());
  });

  it("lets a Registrar with no department book a department-owned room", async () => {
    expect(await createBooking({ ...registrar, departmentId: null, departmentIds: [] }, input)).toMatchObject({ ok: true, status: "AWAITING_APPROVAL" });
    expect(mocks.create).toHaveBeenCalledWith({ data: expect.objectContaining({ departmentId: null, approvalDepartmentId: "cs" }) });
  });

  it("searches all active rooms for the Registrar at Regular priority", async () => {
    mocks.rooms.mockResolvedValue(["cs", "business", null].map((departmentId, i) => ({ id: `room-${i}`, roomName: `Room ${i}`, departmentId, capacity: 20, roomType: "LECTURE_ROOM", equipment: [], floor: null })));
    const result = await searchRooms(registrar, { ...input, roomId: undefined });
    expect(mocks.rooms).toHaveBeenCalledWith(expect.objectContaining({ where: { archivedAt: null } }));
    expect(result.options).toHaveLength(3);
    expect(result.options.find((r) => r.roomId === "room-1")).toMatchObject({ status: "FREE", needsApproval: "Business" });
  });

  it("keeps conflict checks for the Registrar's requests", async () => {
    mocks.plan.mockReturnValue({ blockers: ["An examination is in this room."], items: [], displaced: [] });
    expect(await createBooking(registrar, input)).toMatchObject({ ok: false, error: "An examination is in this room." });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.notify).not.toHaveBeenCalled();
  });
});
