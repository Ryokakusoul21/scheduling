import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Scope } from "@/lib/permissions/scope";

const mocks = vi.hoisted(() => ({ terms: vi.fn(), schedules: vi.fn(), scheduleCount: vi.fn(), faculty: vi.fn(), rooms: vi.fn(),
  roomCount: vi.fn(), requests: vi.fn(), requestCount: vi.fn(), workloads: vi.fn(), report: vi.fn(), conflicts: vi.fn(), availability: vi.fn(), plan: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: {
  semester: { findMany: mocks.terms }, schedule: { findMany: mocks.schedules, count: mocks.scheduleCount },
  faculty: { findMany: mocks.faculty }, room: { findMany: mocks.rooms, count: mocks.roomCount },
  scheduleRequest: { findMany: mocks.requests, count: mocks.requestCount },
} }));
vi.mock("@/lib/workload/load", () => ({ loadWorkload: mocks.workloads }));
vi.mock("@/lib/workload/optimizer", () => ({ loadReport: mocks.report }));
vi.mock("@/lib/scheduler/term-conflicts", () => ({ activeOverlapConflicts: mocks.conflicts }));
vi.mock("@/lib/bookings/availability", () => ({ roomAvailability: mocks.availability }));
vi.mock("@/lib/occupancy/load", () => ({ loadPlan: mocks.plan }));
import { createAssistantData } from "@/lib/ai/assistant-data";

const scope: Scope = {
  userId: "head", name: "Head", role: "HEAD_OF_DEPARTMENT", status: "ACTIVE", archivedAt: null, facultyId: "own-faculty",
  departmentId: "cs", departmentIds: ["cs", "acting"], actingDepartmentIds: ["acting"], programIds: ["bsit"], manageDepartmentId: "cs", isAdmin: false,
};
const meeting = (id = "own") => ({
  id, semesterId: "term", dayOfWeek: "MONDAY", startMin: 480, endMin: 540, status: "PUBLISHED", component: "LECTURE",
  subject: { code: "CS101", name: "Computing" }, faculty: { fullName: "Instructor" },
  section: { name: "BSIT 1A" }, room: { roomName: "Lab", roomNumber: "101" }, semester: { academicYearId: "ay" },
});

describe("targeted assistant data tools", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.terms.mockResolvedValue([{ id: "term", level: "COLLEGE", type: "FIRST_SEMESTER", academicYear: { name: "2026–2027" }, program: null }]);
    mocks.schedules.mockResolvedValue([meeting()]); mocks.scheduleCount.mockResolvedValue(751);
    mocks.faculty.mockResolvedValue([{ id: "allowed" }]); mocks.conflicts.mockResolvedValue([]);
    mocks.requests.mockResolvedValue([]); mocks.requestCount.mockResolvedValue(0);
    mocks.workloads.mockResolvedValue({ faculty: [], assignments: [], limits: { measure: "UNITS", minimum: 12, maximum: 24 } });
    mocks.report.mockReturnValue([]);
  });

  it("uses current acting-department and program scope, and reports totals beyond the old 600-row cap", async () => {
    const data = await createAssistantData(scope);
    const result = await data.execute("getSchedule", { query: "CS101", day: "MONDAY", offset: 40 });
    expect(result).toMatchObject({ total: 751, nextOffset: 41, rows: [{ subject: "CS101 Computing" }] });
    const args = mocks.schedules.mock.calls[0][0];
    expect(args.where.AND).toContainEqual({ section: { departmentId: { in: ["cs", "acting"] }, programId: { in: ["bsit"] } } });
    expect(args.where.AND).toContainEqual({ dayOfWeek: "MONDAY" });
    expect(args.skip).toBe(40); expect(args.take).toBe(20);
    expect([...data.sources.values()]).toContainEqual({ label: "BSIT 1A · CS101", href: "/scheduler?ay=ay&termId=term" });
  });

  it("rejects model-supplied scope overrides, unavailable terms and unknown functions", async () => {
    const data = await createAssistantData(scope);
    expect(await data.execute("getSchedule", { departmentId: "foreign" })).toHaveProperty("error");
    expect(await data.execute("getSchedule", { termId: "inactive-term" })).toHaveProperty("error");
    expect(await data.execute("runSQL", { query: "anything" })).toHaveProperty("error");
    expect(mocks.schedules).not.toHaveBeenCalled();
  });

  it("accepts an omitted argument object for tools whose filters are all optional", async () => {
    const data = await createAssistantData(scope);
    expect(await data.execute("getSchedule", undefined)).toMatchObject({ total: 751 });
    expect(await data.execute("getConflicts", undefined)).toMatchObject({ total: 0 });
  });

  it("answers dated questions from adjusted sessions, excluding cancelled and foreign classes", async () => {
    mocks.schedules.mockResolvedValue([meeting(), meeting("cancelled")]);
    mocks.plan.mockResolvedValue({ sessions: [
      { scheduleId: "own", facultyId: "own-faculty", roomId: "new", startMin: 600, endMin: 660, status: "MOVED" },
      { scheduleId: "foreign", facultyId: "private", roomId: "private", startMin: 480, endMin: 540, status: "REGULAR" },
    ], facultyName: new Map([["own-faculty", "Instructor"], ["private", "Private Person"]]), roomName: new Map([["new", "New Room"]]) });
    const data = await createAssistantData(scope);
    const result = await data.execute("getSchedule", { date: "2026-11-13", mine: true });
    expect(mocks.plan).toHaveBeenCalledWith("2026-11-13", "2026-11-13");
    expect(result).toMatchObject({ total: 1, rows: [{ room: "New Room", start: "10:00 AM", adjustment: "MOVED" }] });
    expect(JSON.stringify(result)).not.toContain("Private Person");
    expect(JSON.stringify(result)).not.toContain("cancelled");
  });

  it.each(["REGISTRAR", "SUPER_ADMINISTRATOR"] as const)("keeps department approvals private from %s", async (role) => {
    const data = await createAssistantData({ ...scope, role, isAdmin: true });
    expect(data.declarations.some((d) => d.name === "getRequests")).toBe(false);
    expect(await data.execute("getRequests", {})).toHaveProperty("error");
    expect(mocks.requests).not.toHaveBeenCalled();
  });

  it("uses computed workload units and limits and excludes other departments from model results", async () => {
    mocks.report.mockReturnValue([
      { facultyId: "allowed", name: "Allowed", load: 27, units: 27, minimum: 12, maximum: 24, status: "OVERLOADED" },
      { facultyId: "foreign", name: "Private Person", load: 30, units: 30, minimum: 12, maximum: 24, status: "OVERLOADED" },
    ]);
    const data = await createAssistantData(scope);
    const result = await data.execute("getWorkloads", { status: "OVERLOADED" });
    expect(result).toMatchObject({ measure: "UNITS", total: 1, rows: [{ name: "Allowed", load: 27, maximum: 24 }] });
    expect(JSON.stringify(result)).not.toContain("Private Person");
    expect(mocks.faculty.mock.calls[0][0].where.departmentId).toEqual({ in: ["cs", "acting"] });
  });

  it("redacts foreign conflict details while keeping a conflict involving an authorized class", async () => {
    mocks.conflicts.mockResolvedValue([
      { type: "ROOM_CONFLICT", description: "PRIVATE SUBJECT AND PERSON", entryA: { id: "own" }, entryB: { id: "foreign" } },
      { type: "ROOM_CONFLICT", entryA: { id: "foreign" }, entryB: { id: "foreign-2" } },
    ]);
    const data = await createAssistantData(scope);
    const result = await data.execute("getConflicts", {});
    expect(result).toMatchObject({ total: 1, rows: [{ first: expect.stringContaining("CS101"), second: "A busy class outside your scope" }] });
    expect(JSON.stringify(result)).not.toContain("PRIVATE");
  });

  it("checks date-specific occupancy including exams and bookings without exposing occupant names", async () => {
    mocks.availability.mockResolvedValue({
      rooms: [{ id: "r", name: "Lab", building: "Main", capacity: 40, closed: false }],
      blocks: [
        { roomId: "r", kind: "EXAMINATION", startMin: 480, endMin: 540, label: "Private exam" },
        { roomId: "r", kind: "BOOKING", startMin: 540, endMin: 600, label: "Private meeting" },
      ],
    });
    const data = await createAssistantData(scope);
    const result = await data.execute("getRoomAvailability", { date: "2026-11-13", startMin: 480, endMin: 600 });
    expect(mocks.availability).toHaveBeenCalledWith(scope, "2026-11-13", 1);
    expect(result).toMatchObject({ rows: [{ busy: [{ kind: "EXAMINATION" }, { kind: "BOOKING" }] }] });
    expect(JSON.stringify(result)).not.toContain("Private");
    expect(await data.execute("getRoomAvailability", { date: "2026-02-30", startMin: 480, endMin: 600 })).toHaveProperty("error");
    expect(await data.execute("getRoomAvailability", { date: "2026-11-13", startMin: 600, endMin: 480 })).toHaveProperty("error");
  });
});
