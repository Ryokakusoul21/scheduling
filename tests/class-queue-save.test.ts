import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ create: vi.fn(), audit: vi.fn(), meetings: vi.fn(), teacher: vi.fn(), overlap: vi.fn(), lock: vi.fn(), transaction: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: {
  section: { findUnique: async () => ({ departmentId: "cs" }) }, schedule: { create: m.create }, auditLog: { create: m.audit }, $transaction: m.transaction,
} }));
vi.mock("@/lib/workload/auto", () => ({ queueWorkloadCheck: vi.fn() }));
vi.mock("@/lib/timetable/service", () => ({ getTimetableConfig: vi.fn() }));
vi.mock("@/lib/scheduler/term-conflicts", () => ({ weeklyDoubleBooking: vi.fn(), concurrentTermIds: async () => ["t1"] }));
vi.mock("@/lib/scheduler/constraints-server", () => ({ activeRules: async () => [], checkClassConstraints: vi.fn() }));
vi.mock("@/lib/notify", () => ({ notifyUsers: vi.fn() }));
import { writeClass } from "@/lib/scheduler/class-save";
beforeEach(() => {
  vi.resetAllMocks();
  m.teacher.mockResolvedValue({ facultyId: "ana" }); m.meetings.mockResolvedValue([]); m.overlap.mockResolvedValue(null);
  m.transaction.mockImplementation(async (fn) => fn({ $executeRaw: m.lock,
    subjectAssignment: { findFirst: m.teacher }, sectionClassPlaceholder: { findFirst: async () => ({ subject: { lectureHours: 3, labHours: 0 } }) },
    schedule: { findMany: m.meetings, findFirst: m.overlap, create: m.create },
  }));
});
const placement = { semesterId: "t1", sectionId: "s1", subjectId: "cc101", facultyId: "ana", roomId: "r1", component: "LECTURE" as const, dayOfWeek: "MONDAY" as const, startMin: 420, endMin: 600 };

describe("saving a curriculum queue placement", () => {
  it("persists the placement while excluding queue and request metadata", async () => {
    m.create.mockImplementation(async ({ data }) => {
      if ("source" in data || "changeReason" in data) throw new Error("Unknown Schedule column");
      return { id: "saved", ...data };
    });
    const input = {
      semesterId: "t1", sectionId: "s1", subjectId: "cc101", facultyId: "ana", roomId: "r1",
      component: "LECTURE" as const, dayOfWeek: "MONDAY" as const, startMin: 420, endMin: 600,
      source: "CURRICULUM_QUEUE", changeReason: "Request-only metadata", notes: "Placed from Unscheduled",
    };
    expect(await writeClass(input, { userId: "head", role: "HEAD_OF_DEPARTMENT" }, "Created class")).toMatchObject({ ok: true, data: { id: "saved", status: "DRAFT", subjectId: "cc101" } });
    expect(m.create.mock.calls[0][0].data).not.toHaveProperty("source");
    expect(m.create.mock.calls[0][0].data).not.toHaveProperty("changeReason");
    expect(input.source).toBe("CURRICULUM_QUEUE");
    expect(m.lock).toHaveBeenCalled();
  });
  it("rejects duplicate hours after another placement completes the offering", async () => {
    m.meetings.mockResolvedValue([{ startMin: 420, endMin: 600 }]);
    expect(await writeClass(placement, { userId: "head", role: "HEAD_OF_DEPARTMENT" }, "Place class")).toMatchObject({ ok: false, error: expect.stringContaining("remaining hours changed") });
    expect(m.create).not.toHaveBeenCalled();
  });
  it("re-checks the current teacher and shared resources inside the insertion transaction", async () => {
    m.teacher.mockResolvedValue({ facultyId: "changed" });
    expect(await writeClass(placement, { userId: "head", role: "HEAD_OF_DEPARTMENT" }, "Place class")).toMatchObject({ ok: false, error: expect.stringContaining("assigned teacher changed") });
    m.teacher.mockResolvedValue({ facultyId: "ana" }); m.overlap.mockResolvedValue({ id: "concurrent-meeting" });
    expect(await writeClass(placement, { userId: "head", role: "HEAD_OF_DEPARTMENT" }, "Place class")).toMatchObject({ ok: false, error: expect.stringContaining("booked while placing") });
    expect(m.create).not.toHaveBeenCalled();
  });
});
