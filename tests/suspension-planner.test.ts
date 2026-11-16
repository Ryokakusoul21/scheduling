import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("@/lib/occupancy/load", () => ({ loadPlan: mocks.load }));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/notify", () => ({ notifyFaculty: vi.fn(), notifyFacultyEach: vi.fn() }));
import { planSuspension } from "@/lib/occupancy/adjust";

const date = "2026-11-16";
const session = (scheduleId: string, sectionId = "own") => ({ scheduleId, sectionId, subjectId: "subject", component: "LECTURE", facultyId: "teacher", roomId: "room", date, startMin: 480, endMin: 540, status: "REGULAR" });

describe("scoped class suspension planning", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.load.mockResolvedValue({ sessions: [session("first"), session("second"), session("foreign", "other")], classInfo: new Map([["first", { departmentId: "cs" }]]), roomName: new Map([["room", "Room 1"]]), facultyName: new Map([["teacher", "Teacher"]]), label: () => "Class" });
  });

  it("changes only the requested class and loads only published meetings", async () => {
    const plan = await planSuspension(["own"], { start: date, end: date }, ["first"]);
    expect(plan.items.map((item) => item.scheduleId)).toEqual(["first"]);
    expect(mocks.load).toHaveBeenCalledWith(date, date, { publishedOnly: true });
  });

  it("does not broaden an empty section selection to the whole school", async () => {
    expect((await planSuspension([], { start: date, end: date })).items).toEqual([]);
    expect(mocks.load).not.toHaveBeenCalled();
  });

  it("requires restoration of prior dated changes instead of silently stacking changes", async () => {
    const snapshot = await mocks.load();
    snapshot.sessions[0].status = "MOVED";
    const plan = await planSuspension(["own"], { start: date, end: date }, ["first"]);
    expect(plan.blockers[0]).toContain("already have a dated schedule change");
    expect(plan.items).toEqual([]);
  });
});
