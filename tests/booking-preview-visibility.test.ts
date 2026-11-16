import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Scope } from "@/lib/permissions/scope";

const m = vi.hoisted(() => ({ load: vi.fn(), plan: vi.fn(), schedules: vi.fn(), exams: vi.fn() }));
vi.mock("@/lib/occupancy/load", () => ({ loadPlan: m.load }));
vi.mock("@/lib/settings", () => ({ getBookingSettings: async () => ({}) }));
vi.mock("@/lib/bookings/plan", async (original) => ({ ...await original<typeof import("@/lib/bookings/plan")>(), planBooking: m.plan }));
vi.mock("@/lib/db/prisma", () => ({ prisma: {
  schedule: { findMany: m.schedules }, examination: { findMany: m.exams },
  room: { findMany: async () => [{ id: "room", roomName: "Room 101", capacity: 40, roomType: "LECTURE", equipment: [], floor: null, departmentId: "cs" }] },
  department: { findMany: async () => [{ id: "cs", name: "Computing" }] },
} }));
import { searchRooms } from "@/lib/bookings/service";

beforeEach(() => {
  vi.clearAllMocks();
  m.schedules.mockResolvedValue([]);
  m.exams.mockResolvedValue([]);
  m.load.mockResolvedValue({ ctx: { occupants: [{ kind: "CLASS", refId: "draft", roomId: "room", date: "2026-11-16", startMin: 480, endMin: 540 }] } });
  m.plan.mockReturnValue({ items: [{ label: "PRIVATE_DRAFT", departmentId: "cs" }], displaced: [], blockers: ["PRIVATE_DRAFT at 8 AM"], notes: ["PRIVATE_DRAFT teacher"], overridable: true });
});

describe("booking preview timetable privacy", () => {
  it("blocks a private draft slot without disclosing its class, teacher, or meeting details", async () => {
    const scope = { role: "REGISTRAR", isAdmin: true, status: "ACTIVE", departmentIds: [], manageDepartmentId: null } as unknown as Scope;
    const { options } = await searchRooms(scope, { roomId: "room", date: "2026-11-16", startMin: 500, endMin: 550, attendees: 20, purpose: "Meeting", priority: "REGULAR" });
    expect(options[0]).toMatchObject({ status: "BLOCKED", items: [], notes: [], overridable: false });
    expect(options[0].blockers).toEqual([expect.stringContaining("unavailable")]);
    expect(JSON.stringify(options)).not.toContain("PRIVATE_DRAFT");
    expect(JSON.stringify(options)).not.toContain("8 AM");
  });
});
