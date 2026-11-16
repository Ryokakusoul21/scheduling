import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_TIMETABLE } from "@/lib/timetable/config";
const m = vi.hoisted(() => ({ config: vi.fn(), section: vi.fn(), term: vi.fn(), before: vi.fn(), meetings: vi.fn(), bookings: vi.fn(), constraints: vi.fn(), subject: vi.fn(), faculty: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/timetable/service", () => ({ getTimetableConfig: m.config }));
vi.mock("@/lib/workload/auto", () => ({ queueWorkloadCheck: vi.fn() }));
vi.mock("@/lib/notify", () => ({ notifyUsers: vi.fn() }));
vi.mock("@/lib/scheduler/term-conflicts", () => ({ weeklyDoubleBooking: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/scheduler/constraints-server", () => ({ activeRules: async () => [], checkClassConstraints: m.constraints }));
vi.mock("@/lib/db/prisma", () => ({ prisma: {
  section: { findUnique: m.section }, semester: { findUnique: m.term }, subject: { findUnique: m.subject },
  faculty: { findUnique: m.faculty }, room: { findUnique: async () => ({ id: "r", archivedAt: null }) },
  schedule: { findUnique: m.before, findMany: m.meetings }, roomBooking: { findMany: m.bookings }, scheduleAdjustment: { findMany: async () => [] },
} }));
import { checkClass, type ClassData } from "@/lib/scheduler/class-save";
const draft: ClassData = { sectionId: "s", subjectId: "it", facultyId: "f", roomId: "r", semesterId: "term", component: "LECTURE", dayOfWeek: "MONDAY", startMin: 425, endMin: 605 };
describe("configured class saves", () => {
  beforeEach(() => {
    vi.clearAllMocks(); m.config.mockResolvedValue(DEFAULT_TIMETABLE); m.before.mockResolvedValue(null);
    m.section.mockResolvedValue({ id: "s", departmentId: "cs", archivedAt: null, level: "COLLEGE" });
    m.subject.mockResolvedValue({ id: "it", archivedAt: null, lectureHours: 3, labHours: 3, level: "COLLEGE" });
    m.faculty.mockResolvedValue({ id: "f", archivedAt: null, teachingLevels: ["COLLEGE"] });
    m.term.mockResolvedValue({ id: "term", level: "COLLEGE", startDate: new Date("2026-11-01"), endDate: new Date("2026-12-01") });
    m.bookings.mockResolvedValue([]); m.constraints.mockResolvedValue([]); m.meetings.mockResolvedValue([]);
  });
  it("validates a live online class without reserving or requiring a physical room", async () => {
    expect(await checkClass({ ...draft, startMin: 420, endMin: 600, roomId: "", deliveryMode: "ONLINE_LIVE", meetingLink: "https://example.com/class" }, { userId: "head" }, { overrideSoft: false })).toBeNull();
    expect(m.bookings).not.toHaveBeenCalled();
    expect(m.constraints).toHaveBeenCalledWith(expect.objectContaining({ roomId: "", deliveryMode: "ONLINE_LIVE" }), undefined);
  });
  it("rejects a subject or term from a different academic level than the section", async () => {
    m.subject.mockResolvedValue({ id: "it", archivedAt: null, lectureHours: 3, labHours: 3, level: "JUNIOR_HIGH" });
    expect(await checkClass(draft, { userId: "head" }, { overrideSoft: true })).toMatchObject({ ok: false, error: expect.stringContaining("same academic level") });
    m.subject.mockResolvedValue({ id: "it", archivedAt: null, lectureHours: 3, labHours: 3, level: "COLLEGE" });
    m.term.mockResolvedValue({ id: "term", level: "SENIOR_HIGH", startDate: new Date("2026-11-01"), endDate: new Date("2026-12-01") });
    expect(await checkClass(draft, { userId: "head" }, { overrideSoft: true })).toMatchObject({ ok: false, error: expect.stringContaining("same academic level") });
  });
  it("requires newly assigned faculty to teach the section's level but keeps existing classes editable", async () => {
    m.faculty.mockResolvedValue({ id: "f", archivedAt: null, teachingLevels: ["ELEMENTARY"] });
    expect(await checkClass(draft, { userId: "head" }, { overrideSoft: true })).toMatchObject({ ok: false, error: expect.stringContaining("does not teach") });
    m.before.mockResolvedValue({ ...draft, id: "existing" });
    expect(await checkClass({ ...draft, id: "existing" }, { userId: "head" }, { overrideSoft: true })).not.toMatchObject({ error: expect.stringContaining("does not teach") });
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
    expect(await checkClass({ ...draft, id: "existing", startMin: 430, endMin: 610 }, { userId: "head" }, { overrideSoft: true })).toMatchObject({ ok: false });
  });
  it("retains existing constraint checks after configured time validation", async () => {
    m.config.mockResolvedValue({ ...DEFAULT_TIMETABLE, mode: "DYNAMIC" });
    m.constraints.mockResolvedValue([{ hard: true, constraintName: "Teaching hours", message: "Required hours exceeded" }]);
    expect(await checkClass(draft, { userId: "head" }, { overrideSoft: true })).toMatchObject({ ok: false, error: "Teaching hours: Required hours exceeded" });
  });
  it("accepts two 1.5-hour meetings or one 3-hour block and refuses overfilling or extending a split meeting", async () => {
    m.config.mockResolvedValue({ ...DEFAULT_TIMETABLE, classSession: "SPLIT_90" });
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
  it("holds College meetings to 3 hours unless split meetings are chosen or it is the last meeting", async () => {
    expect(await checkClass({ ...draft, startMin: 480, endMin: 570 }, { userId: "head" }, { overrideSoft: false })).toMatchObject({ ok: false, error: "College classes meet for 3 hours." });
    m.subject.mockResolvedValue({ id: "it", archivedAt: null, lectureHours: 4.5, labHours: 3, level: "COLLEGE" });
    m.meetings.mockResolvedValue([{ startMin: 480, endMin: 660 }]);
    expect(await checkClass({ ...draft, dayOfWeek: "WEDNESDAY", startMin: 480, endMin: 570 }, { userId: "head" }, { overrideSoft: false })).toBeNull();
    expect(await checkClass({ ...draft, dayOfWeek: "WEDNESDAY", startMin: 480, endMin: 540 }, { userId: "head" }, { overrideSoft: false })).toMatchObject({ ok: false, error: "Last meeting must be 1.5 h." });
  });
});
