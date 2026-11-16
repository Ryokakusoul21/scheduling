import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ scope: vi.fn(), bookings: vi.fn(), rooms: vi.fn(), faculty: vi.fn(), departments: vi.fn() }));
vi.mock("@/lib/permissions/scope", () => ({ requireScope: mocks.scope, policyUserFromScope: (scope: Record<string, unknown>) => ({ ...scope, id: scope.userId }) }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { roomBooking: { findMany: mocks.bookings }, room: { findMany: mocks.rooms }, faculty: { findMany: mocks.faculty }, department: { findMany: mocks.departments } } }));
vi.mock("@/lib/settings", () => ({ getBookingSettings: vi.fn(async () => ({ openMin: 420, closeMin: 1260, bufferMinutes: 10 })) }));
vi.mock("@/lib/bookings/service", () => ({ overrideCaps: vi.fn() }));
vi.mock("@/app/(dashboard)/bookings/booking-workspace", () => ({ BookingWorkspace: () => null }));

import BookingsPage from "@/app/(dashboard)/bookings/page";

describe("historical booking detail links", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.scope.mockResolvedValue({ userId: "faculty", role: "FACULTY", status: "ACTIVE", facultyId: null, departmentIds: ["cs"], isAdmin: false });
    mocks.bookings.mockResolvedValue([]); mocks.rooms.mockResolvedValue([]); mocks.faculty.mockResolvedValue([]); mocks.departments.mockResolvedValue([]);
  });

  it("includes the linked historical booking while retaining the caller's ownership filter", async () => {
    await BookingsPage({ searchParams: Promise.resolve({ booking: "historical-booking" }) });
    const where = mocks.bookings.mock.calls[0][0].where;
    expect(where.AND[0].OR).toContainEqual({ id: "historical-booking" });
    expect(where.AND[1]).toEqual({ OR: [{ bookedById: "faculty" }] });
  });

  it("identifies rooms by code and name in choices and booking history", async () => {
    mocks.rooms.mockResolvedValue(["GA-303", "GA-309"].map((roomNumber) => ({ id: roomNumber, roomNumber, roomName: "Lecture room", capacity: 40, floor: { building: { name: "Building A" } } })));
    mocks.bookings.mockResolvedValue([{
      id: "booking", roomId: "GA-303", room: { roomNumber: "GA-303", roomName: "Lecture room" },
      date: new Date("2026-11-16T00:00:00Z"), startMin: 480, endMin: 540, priority: "REGULAR", status: "CONFIRMED",
      bookedById: "faculty", bookedBy: { name: "Faculty" }, purpose: "Meeting", attendees: 10, batch: null, displaced: [], acknowledgements: [],
    }]);
    const page = await BookingsPage({ searchParams: Promise.resolve({}) });
    const props = page.props.children[1].props;
    expect(props.roomChoices.map((choice: { label: string }) => choice.label)).toEqual([
      "GA-303 · Lecture room · Building A · 40 seats", "GA-309 · Lecture room · Building A · 40 seats",
    ]);
    expect(props.bookings[0].roomName).toBe("GA-303 · Lecture room");
    expect(mocks.rooms.mock.calls[1][0].select).toMatchObject({ roomNumber: true, roomName: true });
  });
});
