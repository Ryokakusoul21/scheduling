import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Scope } from "@/lib/permissions/scope";
import { submittedTimetableFilter } from "@/lib/scheduler/visibility";

const m = vi.hoisted(() => ({ plan: vi.fn(), classes: vi.fn(), exams: vi.fn() }));
vi.mock("@/lib/occupancy/load", () => ({ loadPlan: m.plan }));
vi.mock("@/lib/db/prisma", () => ({ prisma: {
  room: { findMany: async () => [{ id: "room", roomName: "Room 101", capacity: 40, status: "AVAILABLE", floor: null }] },
  schedule: { findMany: m.classes }, examination: { findMany: m.exams },
} }));
import { roomAvailability } from "@/lib/bookings/availability";

const scope = (role: Scope["role"]) => ({ role, isAdmin: role !== "HEAD_OF_DEPARTMENT", status: "ACTIVE", departmentIds: ["cs"], manageDepartmentId: "cs" }) as Scope;
beforeEach(() => {
  vi.clearAllMocks();
  m.classes.mockResolvedValue([{ id: "submitted" }]);
  m.exams.mockResolvedValue([]);
  m.plan.mockResolvedValue({
    bookings: [], classInfo: new Map([["draft", { departmentId: "cs" }], ["submitted", { departmentId: "cs" }]]),
    ctx: { occupants: [
      { refId: "draft", kind: "CLASS", roomId: "room", date: "2026-11-16", startMin: 480, endMin: 540, label: "PRIVATE CLASS DETAILS" },
      { refId: "draft-exam", kind: "EXAMINATION", roomId: "room", date: "2026-11-16", startMin: 540, endMin: 600, label: "PRIVATE EXAM DETAILS" },
      { refId: "submitted", kind: "CLASS", roomId: "room", date: "2026-11-16", startMin: 600, endMin: 660, label: "Submitted class" },
    ] },
  });
});

describe("timetable privacy in room availability", () => {
  it.each(["SUPER_ADMINISTRATOR", "REGISTRAR"] as const)("keeps draft occupancy anonymous for %s while retaining every blocked slot", async (role) => {
    const result = await roomAvailability(scope(role), "2026-11-16", 1);
    expect(result.blocks).toHaveLength(3);
    expect(result.blocks.map((row) => row.label)).toEqual(["Unavailable", "Unavailable", "Submitted class"]);
    expect(JSON.stringify(result)).not.toContain("PRIVATE");
    expect(m.classes.mock.calls[0][0].where).toMatchObject(submittedTimetableFilter(role));
    expect(m.exams.mock.calls[0][0].where).toMatchObject(submittedTimetableFilter(role));
    expect(m.plan).toHaveBeenCalledWith("2026-11-16", "2026-11-16");
  });

  it("preserves the Head's visibility into the department's own drafts", async () => {
    const result = await roomAvailability(scope("HEAD_OF_DEPARTMENT"), "2026-11-16", 1);
    expect(result.blocks[0].label).toBe("PRIVATE CLASS DETAILS");
    expect(m.classes).not.toHaveBeenCalled();
  });
});
