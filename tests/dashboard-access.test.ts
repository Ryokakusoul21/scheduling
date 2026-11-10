import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Scope } from "@/lib/permissions/scope";

const mocks = vi.hoisted(() => ({
  sections: vi.fn(), submissions: vi.fn(), periods: vi.fn(), schedule: vi.fn(), drafts: vi.fn(), requests: vi.fn(), bookings: vi.fn(), plan: vi.fn(), notifications: vi.fn(), me: vi.fn(), term: vi.fn(), counts: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/analytics/department-staffing", () => ({ departmentStaffing: vi.fn() }));
vi.mock("@/lib/settings", () => ({ getWorkloadSettings: vi.fn(async () => ({ measure: "HOURS", maximum: 24 })) }));
vi.mock("@/lib/occupancy/load", () => ({ loadPlan: mocks.plan }));
vi.mock("@/lib/db/prisma", () => ({ prisma: {
  section: { findMany: mocks.sections }, timetableSubmission: { findMany: mocks.submissions, groupBy: mocks.counts }, schedulingPeriod: { findMany: mocks.periods },
  schedule: { findMany: mocks.schedule, count: mocks.drafts }, scheduleRequest: { count: mocks.requests }, roomBooking: { count: mocks.bookings },
  notification: { findMany: mocks.notifications }, faculty: { findUniqueOrThrow: mocks.me }, semester: { findUniqueOrThrow: mocks.term },
} }));

import { administratorLanding, facultyLanding, headLanding, registrarLanding } from "@/lib/dashboard/landing";

const scope: Scope = { userId: "user", name: "Teacher", role: "HEAD_OF_DEPARTMENT", status: "ACTIVE", archivedAt: null, facultyId: "teacher", departmentId: "own", departmentIds: ["own", "acting"], actingDepartmentIds: ["acting"], programIds: ["bsit"], manageDepartmentId: "own", isAdmin: false };

describe("landing page data boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sections.mockResolvedValue([]); mocks.submissions.mockResolvedValue([]); mocks.periods.mockResolvedValue([]); mocks.counts.mockResolvedValue([]);
    mocks.drafts.mockResolvedValue(0); mocks.requests.mockResolvedValue(0); mocks.bookings.mockResolvedValue(0); mocks.notifications.mockResolvedValue([]);
    mocks.term.mockResolvedValue({ id: "term", level: "COLLEGE" }); mocks.me.mockResolvedValue({ maxHours: 24 });
  });

  it("does not expose the Administrator or Registrar loaders to other roles", async () => {
    await expect(administratorLanding({ ...scope, role: "REGISTRAR" })).rejects.toThrow("Administrator access required");
    await expect(registrarLanding({ ...scope, role: "SUPER_ADMINISTRATOR" })).rejects.toThrow("Registrar access required");
    await expect(headLanding({ ...scope, role: "FACULTY" }, "term")).rejects.toThrow("Department access required");
    await expect(facultyLanding({ ...scope, role: "STUDENT" })).rejects.toThrow("Linked faculty access required");
  });

  it("applies department and program restrictions before reading section progress", async () => {
    await headLanding(scope, "term");
    expect(mocks.sections.mock.calls[0][0].where.AND[0]).toEqual({ departmentId: { in: ["own", "acting"] }, programId: { in: ["bsit"] } });
    expect(mocks.submissions.mock.calls[0][0].where).toMatchObject({ departmentId: { in: ["own", "acting"] }, semesterId: "term" });
  });

  it("keeps submitted and approved timetable counts separate", async () => {
    mocks.counts.mockResolvedValue([{ status: "SUBMITTED", kind: "CLASS", _count: 3 }, { status: "SUBMITTED", kind: "EXAMINATION", _count: 2 }, { status: "APPROVED", kind: "CLASS", _count: 4 }]);
    const result = await registrarLanding({ ...scope, role: "REGISTRAR" });
    expect(result).toMatchObject({ awaitingReview: 5, awaitingPublication: 4, examinationSubmissions: 2 });
    expect(mocks.submissions.mock.calls[0][0].orderBy).toEqual({ submittedAt: "asc" });
  });

  it("shows only the teacher's published meetings, including substitutions", async () => {
    const date = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
    mocks.plan.mockResolvedValue({ sessions: [
      { scheduleId: "published", facultyId: "teacher", date, startMin: 540, endMin: 600, roomId: "r", status: "MOVED" },
      { scheduleId: "draft", facultyId: "teacher", date, startMin: 600, endMin: 660, roomId: "r", status: "REGULAR" },
      { scheduleId: "foreign", facultyId: "other", date, startMin: 660, endMin: 720, roomId: "r", status: "REGULAR" },
    ], label: () => "My class", roomName: new Map([["r", "Room 101"]]) });
    mocks.schedule.mockImplementation(async ({ where }: { where: { facultyId?: string } }) => where.facultyId ? [] : [{ id: "published" }]);
    const result = await facultyLanding({ ...scope, role: "FACULTY" });
    expect(result.today).toHaveLength(1);
    expect(result.today[0]).toMatchObject({ title: "My class", changed: true, room: "Room 101" });
    expect(mocks.schedule.mock.calls[1][0].where).toEqual({ id: { in: ["published", "draft"] }, status: "PUBLISHED" });
    expect(mocks.notifications.mock.calls[0][0].where).toEqual({ userId: "user" });
    expect(mocks.requests.mock.calls[0][0].where.requestedById).toBe("user");
  });
});
