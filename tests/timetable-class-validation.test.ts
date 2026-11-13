import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_TIMETABLE } from "@/lib/timetable/config";
const m = vi.hoisted(() => ({ config: vi.fn(), section: vi.fn(), term: vi.fn(), before: vi.fn(), meetings: vi.fn(), bookings: vi.fn(), constraints: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/timetable/service", () => ({ getTimetableConfig: m.config }));
vi.mock("@/lib/workload/auto", () => ({ queueWorkloadCheck: vi.fn() }));
vi.mock("@/lib/notify", () => ({ notifyUsers: vi.fn() }));
vi.mock("@/lib/scheduler/term-conflicts", () => ({ weeklyDoubleBooking: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/scheduler/constraints-server", () => ({ checkClassConstraints: m.constraints }));
vi.mock("@/lib/db/prisma", () => ({ prisma: {
  section: { findUnique: m.section }, semester: { findUnique: m.term }, subject: { findUnique: async () => ({ id: "it", archivedAt: null, lectureHours: 3, labHours: 3 }) },
  faculty: { findUnique: async () => ({ id: "f", archivedAt: null }) }, room: { findUnique: async () => ({ id: "r", archivedAt: null }) },
  schedule: { findUnique: m.before, findMany: m.meetings }, roomBooking: { findMany: m.bookings }, scheduleAdjustment: { findMany: async () => [] },
} }));
import { checkClass, type ClassData } from "@/lib/scheduler/class-save";
const draft: ClassData = { sectionId: "s", subjectId: "it", facultyId: "f", roomId: "r", semesterId: "term", component: "LECTURE", dayOfWeek: "MONDAY", startMin: 425, endMin: 470 };
describe("configured class saves", () => {
  beforeEach(() => {
    vi.clearAllMocks(); m.config.mockResolvedValue(DEFAULT_TIMETABLE); m.before.mockResolvedValue(null);
    m.section.mockResolvedValue({ id: "s", departmentId: "cs", archivedAt: null });
    m.term.mockResolvedValue({ id: "term", startDate: new Date("2026-11-01"), endDate: new Date("2026-12-01") });
    m.bookings.mockResolvedValue([]); m.constraints.mockResolvedValue([]); m.meetings.mockResolvedValue([]);
  });
  it("rejects an off-grid fixed placement and accepts the same duration in dynamic mode", async () => {
    expect(await checkClass(draft, { userId: "head" }, { overrideSoft: true })).toMatchObject({ ok: false, error: expect.stringContaining("30-minute") });
    m.config.mockResolvedValue({ ...DEFAULT_TIMETABLE, mode: "DYNAMIC", adjustmentStep: 5 });
    expect(await checkClass(draft, { userId: "head" }, { overrideSoft: false })).toBeNull();
    expect(m.config).toHaveBeenCalledWith("term", "cs");
  });
  it("preserves an existing off-grid time on a resource-only edit but validates retiming", async () => {
    m.before.mockResolvedValue({ ...draft, id: "existing" });
    expect(await checkClass({ ...draft, id: "existing", facultyId: "new-faculty" }, { userId: "head" }, { overrideSoft: false })).toBeNull();
    expect(m.config).not.toHaveBeenCalled();
    expect(await checkClass({ ...draft, id: "existing", startMin: 430, endMin: 475 }, { userId: "head" }, { overrideSoft: true })).toMatchObject({ ok: false });
  });
  it("retains existing constraint checks after configured time validation", async () => {
    m.config.mockResolvedValue({ ...DEFAULT_TIMETABLE, mode: "DYNAMIC" });
    m.constraints.mockResolvedValue([{ hard: true, constraintName: "Teaching hours", message: "Required hours exceeded" }]);
    expect(await checkClass(draft, { userId: "head" }, { overrideSoft: true })).toMatchObject({ ok: false, error: "Teaching hours: Required hours exceeded" });
  });
  it("accepts two 1.5-hour meetings or one 3-hour block and refuses overfilling or extending a split meeting", async () => {
    const meeting = { ...draft, startMin: 480, endMin: 570 };
    expect(await checkClass(meeting, { userId: "head" }, { overrideSoft: false })).toBeNull();
    m.meetings.mockResolvedValue([{ startMin: 480, endMin: 570 }]);
    expect(await checkClass({ ...meeting, dayOfWeek: "WEDNESDAY" }, { userId: "head" }, { overrideSoft: false })).toBeNull();
    m.meetings.mockResolvedValue([]);
    expect(await checkClass({ ...meeting, endMin: 660 }, { userId: "head" }, { overrideSoft: false })).toBeNull();
    m.meetings.mockResolvedValue([{ startMin: 480, endMin: 570 }]);
    m.before.mockResolvedValue({ ...meeting, id: "first" });
    expect(await checkClass({ ...meeting, id: "first", endMin: 660 }, { userId: "head" }, { overrideSoft: true })).toMatchObject({ ok: false, error: expect.stringContaining("required 3 weekly hours") });
    expect(m.meetings).toHaveBeenLastCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: { not: "first" }, semesterId: "term", component: "LECTURE" }) }));
  });
});
