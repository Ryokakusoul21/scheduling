import { describe, expect, it } from "vitest";
import { explain, loadReport, optimize, type Assignment, type WFaculty, type WorkloadLimits } from "@/lib/workload/optimizer";

const limits: WorkloadLimits = { measure: "HOURS", minimum: 6, maximum: 9 };
const fac = (id: string, over: Partial<WFaculty> = {}): WFaculty => ({
  id, name: id.toUpperCase(), departmentId: "d1", specialization: null, teachingLevels: ["COLLEGE"], maxHours: 24, availability: [], ...over,
});
// Each assignment is one 3-hour meeting on a different day so they never clash.
const DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"] as const;
const asg = (key: string, facultyId: string, day: number, over: Partial<Assignment> = {}): Assignment => ({
  key, facultyId, subjectName: "Programming", subjectUnits: 3, sectionName: key, sectionLevel: "COLLEGE", departmentId: "d1",
  meetings: [{ scheduleId: `${key}-1`, dayOfWeek: DAYS[day], startMin: 480, endMin: 660 }], ...over,
});
const busyOf = (as: Assignment[]) => {
  const m = new Map<string, Assignment["meetings"]>();
  for (const a of as) m.set(a.facultyId, [...(m.get(a.facultyId) ?? []), ...a.meetings]);
  return m;
};

describe("workload optimizer", () => {
  it("flags overloaded and underloaded faculty", () => {
    const as = [asg("a", "busy", 0), asg("b", "busy", 1), asg("c", "busy", 2), asg("d", "busy", 3), asg("e", "idle", 4)];
    const report = loadReport([fac("busy"), fac("idle")], as, limits);
    expect(report.map((r) => r.status)).toEqual(["OVERLOADED", "UNDERLOADED"]);
  });

  it("moves classes from the overloaded to the underloaded and explains why", () => {
    const as = [asg("a", "busy", 0), asg("b", "busy", 1), asg("c", "busy", 2), asg("d", "busy", 3), asg("e", "idle", 4)];
    const faculty = [fac("busy"), fac("idle", { specialization: "Programming" })];
    const { moves, after } = optimize(faculty, as, limits, busyOf(as));
    expect(moves).toHaveLength(1);
    expect(moves[0]).toMatchObject({ fromFacultyId: "busy", toFacultyId: "idle", amount: 3 });
    expect(moves[0].reason).toMatch(/same department/);
    expect(after.every((a) => a.status === "BALANCED")).toBe(true);
    expect(explain(loadReport(faculty, as, limits), after, moves)).toMatch(/After: 0 overloaded and 0 underloaded/);
  });

  it("never double-books the receiver or ignores the teaching level", () => {
    const as = [asg("a", "busy", 0), asg("b", "busy", 1), asg("c", "busy", 2), asg("d", "busy", 3), asg("x", "idle", 0), asg("y", "idle", 1)];
    const clashing = { ...as[0] };
    const faculty = [fac("busy"), fac("idle"), fac("basic", { teachingLevels: ["ELEMENTARY"] })];
    const { moves } = optimize(faculty, as, limits, busyOf(as));
    expect(moves.every((m) => m.toFacultyId !== "basic")).toBe(true);
    expect(moves.some((m) => m.key === clashing.key && m.toFacultyId === "idle")).toBe(false);
  });
});
