import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ faculty: vi.fn(), schedules: vi.fn(), planned: vi.fn() }));
vi.mock("@/lib/settings", () => ({ getWorkloadSettings: async () => ({ measure: "HOURS", minimum: 0, maximum: 24 }) }));
vi.mock("@/lib/scheduler/term-conflicts", () => ({ concurrentTermIds: async (id: string) => [id] }));
vi.mock("@/lib/db/prisma", () => ({ prisma: {
  faculty: { findMany: m.faculty }, schedule: { findMany: m.schedules }, subjectAssignment: { findMany: m.planned },
  workloadFix: { findMany: async () => [] }, workloadProposalItem: { findMany: async () => [] },
} }));
import { loadWorkload } from "@/lib/workload/load";
import { loadReport } from "@/lib/workload/optimizer";
import { summarizeDepartmentStaffing } from "@/lib/analytics/department-staffing-summary";
import { submittedTimetableFilter } from "@/lib/scheduler/visibility";

const teacher = (id: string) => ({ id, fullName: id, status: "ACTIVE", archivedAt: null, departmentId: "cs", department: { name: "Computing" }, specialization: null, teachingLevels: ["COLLEGE"], maxHours: 24, employmentType: "FULL_TIME", availability: [] });
const subject = { code: "CC101", name: "Computing", units: 3, lectureHours: 3, labHours: 0, level: "COLLEGE", departmentId: "cs" };
const section = (id: string) => ({ name: id, level: "COLLEGE", departmentId: "cs" });
const plan = (sectionId: string, facultyId = "ana", semesterId = "t1") => ({ id: `assignment-${semesterId}-${sectionId}`, sectionId, facultyId, subjectId: "cc101", semesterId, section: section(sectionId), subject });
const meeting = (id: string, sectionId: string, hours: number, facultyId = "ana", semesterId = "t1") => ({ id, sectionId, facultyId, semesterId, subjectId: "cc101", dayOfWeek: "MONDAY", startMin: 480, endMin: 480 + hours * 60, subject, section: section(sectionId) });
async function report() {
  const data = await loadWorkload(["t1", "t2"], null);
  return { data, rows: loadReport(data.faculty, data.assignments, data.limits) };
}
beforeEach(() => {
  vi.resetAllMocks();
  m.faculty.mockResolvedValue([teacher("ana"), teacher("ben")]);
  m.schedules.mockResolvedValue([]);
  m.planned.mockResolvedValue(Array.from({ length: 8 }, (_, i) => plan(`s${i + 1}`)));
});

describe("per-section workload accounting", () => {
  it.each(["REGISTRAR", "SUPER_ADMINISTRATOR"])("withholds unsubmitted meeting times from %s workload views", async (role) => {
    await loadWorkload(["t1"], null, { visibilityRole: role });
    expect(m.schedules.mock.calls[0][0].where).toMatchObject(submittedTimetableFilter(role));
  });

  it("keeps unsubmitted classes in internal workload and collision calculations", async () => {
    await loadWorkload(["t1"], null);
    expect(m.schedules.mock.calls[0][0].where).toEqual({ semesterId: { in: ["t1"] }, status: { not: "ARCHIVED" } });
  });

  it("counts eight unscheduled CC101 offerings as 24 hours and units", async () => {
    const { rows, data } = await report();
    expect(rows[0]).toMatchObject({ load: 24, units: 24 });
    expect(data.assignments).toHaveLength(8);
    expect(new Set(data.assignments.map((a) => a.sectionName)).size).toBe(8);
  });
  it("retains the other seven offerings after scheduling one section", async () => {
    m.schedules.mockResolvedValue([meeting("e1", "s1", 3)]);
    const { rows, data } = await report();
    expect(rows[0]).toMatchObject({ load: 24, units: 24 });
    expect(data.assignments).toHaveLength(8);
  });
  it("counts scheduled plus remaining hours for a split meeting without duplication", async () => {
    m.schedules.mockResolvedValue([meeting("e1", "s1", 1.5)]);
    const { rows, data } = await report();
    expect(rows[0].load).toBe(24);
    expect(data.assignments.find((a) => a.sectionName === "s1")).toMatchObject({ plannedHours: 1.5, assignmentId: "assignment-t1-s1" });
    const staffing = summarizeDepartmentStaffing([{ id: "cs", code: "CS", name: "Computing" }], [{ id: "ana", departmentId: "cs", maxCapacity: 24 }], data.assignments, [], "HOURS");
    expect(staffing[0].assignedLoad).toBe(24);
    m.schedules.mockResolvedValue([meeting("e1", "s1", 1.5), meeting("e2", "s1", 1.5)]);
    expect((await report()).rows[0]).toMatchObject({ load: 24, units: 24 });
  });
  it("keeps terms separate even for the same section, subject and teacher", async () => {
    m.planned.mockResolvedValue([plan("s1"), plan("s1", "ana", "t2")]);
    m.schedules.mockResolvedValue([meeting("e1", "s1", 1.5), meeting("e2", "s1", 1.5, "ana", "t2")]);
    expect((await report()).rows[0]).toMatchObject({ load: 6, units: 6 });
  });
  it("assigns one section to a different teacher without changing the other seven", async () => {
    m.planned.mockResolvedValue([plan("s1", "ben"), ...Array.from({ length: 7 }, (_, i) => plan(`s${i + 2}`))]);
    expect((await report()).rows.map((r) => r.load)).toEqual([21, 3]);
  });
  it("retains already scheduled hours with their teacher after a partial reassignment", async () => {
    m.planned.mockResolvedValue([plan("s1", "ben")]);
    m.schedules.mockResolvedValue([meeting("e1", "s1", 1.5)]);
    expect((await report()).rows.map((r) => ({ load: r.load, units: r.units }))).toEqual([{ load: 1.5, units: 1.5 }, { load: 1.5, units: 1.5 }]);
  });
  it("shows over-plotted hours instead of hiding them behind the curriculum requirement", async () => {
    m.planned.mockResolvedValue([plan("s1")]);
    m.schedules.mockResolvedValue([meeting("e1", "s1", 4)]);
    expect((await report()).rows[0]).toMatchObject({ load: 4, units: 3 });
  });
});
