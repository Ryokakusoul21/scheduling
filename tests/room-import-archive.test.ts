import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rooms: vi.fn(), departments: vi.fn(), floors: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: {
  room: { findMany: mocks.rooms }, department: { findMany: mocks.departments }, floor: { findMany: mocks.floors },
} }));
vi.mock("@/lib/permissions/scope", () => ({
  requireScope: async () => ({ userId: "registrar", role: "REGISTRAR", isAdmin: true }),
  policyUserFromScope: (scope: unknown) => scope,
}));
vi.mock("@/lib/permissions/policy", () => ({ can: () => true }));
vi.mock("@/lib/workload/auto", () => ({ queueWorkloadCheck: vi.fn() }));
vi.mock("@/lib/subjects/permissions", () => ({ canManageSubject: vi.fn() }));
vi.mock("@/lib/permissions/department", () => ({ logBlocked: vi.fn() }));
vi.mock("@/lib/notify", () => ({ notifyFacultyEach: vi.fn() }));

import { validateImportAction } from "@/app/(dashboard)/import/actions";

const room = { roomNumber: "201", roomName: "New classroom", building: "Building A", floor: "Second Floor", capacity: "40", roomType: "Lecture room", equipment: "", department: "" };

describe("room imports after archiving", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.departments.mockResolvedValue([]);
    mocks.floors.mockResolvedValue([{ name: "Second Floor", building: { name: "Building A" } }]);
  });

  it("allows a number that only belongs to archived rooms", async () => {
    mocks.rooms.mockImplementation(async ({ where }) => where?.archivedAt === null ? [] : [{ roomNumber: "201" }]);
    const result = await validateImportAction("rooms", [room]);
    expect(mocks.rooms).toHaveBeenCalledWith({ where: { archivedAt: null }, select: { roomNumber: true } });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data[0].errors).toEqual([]);
      expect(result.data[0].data).toMatchObject({ roomNumber: "201", roomName: "New classroom" });
    }
  });

  it("still blocks a number already used by an active room", async () => {
    mocks.rooms.mockResolvedValue([{ roomNumber: "201" }]);
    const result = await validateImportAction("rooms", [room]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data[0].data).toBeNull();
      expect(result.data[0].errors).toContain("Room number 201 already exists.");
    }
  });
});
