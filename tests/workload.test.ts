import { describe, expect, it } from "vitest";
import { balanceSummary, basisOf, explain, loadReport, optimize, validateRows, type Assignment, type WFaculty, type WorkloadLimits } from "@/lib/workload/optimizer";

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

  it("records both faculty loads before and after each move", () => {
    const as = [asg("a", "busy", 0), asg("b", "busy", 1), asg("c", "busy", 2), asg("d", "busy", 3), asg("e", "idle", 4)];
    const { moves } = optimize([fac("busy"), fac("idle")], as, limits, busyOf(as));
    expect(moves[0]).toMatchObject({ fromBefore: 12, fromAfter: 9, toBefore: 3, toAfter: 6 });
  });

  it("does not repeat a move that was undone", () => {
    const as = [asg("a", "busy", 0), asg("b", "busy", 1), asg("c", "busy", 2), asg("d", "busy", 3), asg("e", "idle", 4)];
    const blocked = new Set(["a", "b", "c", "d"]);
    const { moves, flags } = optimize([fac("busy"), fac("idle")], as, limits, busyOf(as), { blocked });
    expect(moves).toHaveLength(0);
    expect(flags.map((f) => f.kind)).toEqual(["OVERLOADED", "UNDERLOADED"]);
    expect(flags[0].explanation).toMatch(/kept in place/);
  });

  it("reassigns classes of inactive faculty, or flags them when nobody qualifies", () => {
    const orphan = asg("o", "gone", 2);
    const stranded = asg("s", "gone", 3, { sectionLevel: "ELEMENTARY" });
    const as = [asg("x", "idle", 0)];
    const { moves, flags } = optimize([fac("idle")], as, limits, busyOf(as), { unassigned: [orphan, stranded], inactiveNames: new Map([["gone", "Former"]]) });
    expect(moves).toEqual([expect.objectContaining({ key: "o", fromFacultyId: "gone", toFacultyId: "idle" })]);
    expect(flags.find((f) => f.kind === "UNASSIGNED")?.explanation).toMatch(/Former is no longer active/);
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

// A class of the given length (hours) starting at 8:00 on one day.
const sized = (key: string, facultyId: string, day: number, hours: number, over: Partial<Assignment> = {}) =>
  asg(key, facultyId, day, { meetings: [{ scheduleId: `${key}-1`, dayOfWeek: DAYS[day], startMin: 480, endMin: 480 + hours * 60 }], ...over });

describe("balance rules", () => {
  it("applies the part-time range and the unit cap", () => {
    const as = [asg("a", "pt", 0), asg("b", "pt", 1), asg("c", "pt", 2), asg("d", "ft", 0), asg("e", "ft", 1), asg("f", "ft", 2)];
    const rules: WorkloadLimits = { ...limits, partTimeMinimum: 3, partTimeMaximum: 6, maxUnits: 6 };
    const report = loadReport([fac("pt", { employmentType: "PART_TIME" }), fac("ft")], as, rules);
    expect(report[0]).toMatchObject({ load: 9, maximum: 6, status: "OVERLOADED" });
    // Nine hours is inside the full-time range, but nine units break the six-unit cap.
    expect(report[1]).toMatchObject({ load: 9, units: 9, status: "OVERLOADED" });
  });

  it("counts statuses and scores how evenly a department is loaded", () => {
    const rows = [
      { load: 8.5, maximum: 9, status: "BALANCED" as const, departmentId: "d1" },
      { load: 6, maximum: 9, status: "BALANCED" as const, departmentId: "d1" },
      { load: 12, maximum: 9, status: "OVERLOADED" as const, departmentId: "d1" },
      { load: 2, maximum: 9, status: "UNDERLOADED" as const, departmentId: "d1" },
    ];
    expect(balanceSummary(rows, 3)).toEqual({ overloaded: 1, underloaded: 1, balanced: 2, nearLimit: 1, score: 50 });
    expect(balanceSummary([], 3).score).toBe(100);
  });
});

describe("proposal generation", () => {
  it("prefers the smallest class that brings the donor within range", () => {
    // 11 hours against a 9-hour maximum: a 3-hour class fixes it, so the 5-hour one stays.
    const as = [sized("small", "busy", 0, 3), sized("big", "busy", 1, 5), sized("rest", "busy", 2, 3), asg("x", "idle", 3), asg("y", "idle", 4)];
    const { moves } = optimize([fac("busy"), fac("idle")], as, limits, busyOf(as));
    expect(moves).toHaveLength(1);
    expect(moves[0]).toMatchObject({ key: "small", amount: 3 });
  });

  it("uses the fewest moves when no single small class is enough", () => {
    const as = [sized("a", "busy", 0, 2), sized("b", "busy", 1, 2), sized("c", "busy", 2, 2), sized("d", "busy", 3, 6), sized("e", "busy", 4, 3)];
    const { moves } = optimize([fac("busy"), fac("idle")], as, limits, busyOf(as));
    expect(moves).toHaveLength(1);
    expect(moves[0]).toMatchObject({ key: "d", amount: 6 });
  });

  it("moves an assigned subject that is not scheduled yet", () => {
    const planned = asg("plan|p1", "busy", 0, { meetings: [], plannedHours: 3, assignmentId: "p1" });
    const as = [asg("a", "busy", 0), asg("b", "busy", 1), asg("c", "busy", 2), planned, asg("e", "idle", 4)];
    // The receiver teaches elsewhere at every scheduled time, so only the unscheduled subject can move.
    const busy = busyOf(as);
    busy.set("idle", DAYS.map((d, i) => ({ scheduleId: `other-${i}`, dayOfWeek: d, startMin: 480, endMin: 660 })));
    const { moves } = optimize([fac("busy"), fac("idle")], as, limits, busy);
    expect(moves).toEqual([expect.objectContaining({ assignmentId: "p1", scheduleIds: [] })]);
  });

  it("never offers a rejected class to the same receiver again, but tries someone else", () => {
    const as = [asg("a", "busy", 0), asg("b", "busy", 1), asg("c", "busy", 2), asg("d", "busy", 3), asg("e", "idle", 4), asg("f", "other", 4)];
    const blocked = new Set(["a>idle", "b>idle", "c>idle", "d>idle"]);
    const { moves } = optimize([fac("busy"), fac("idle"), fac("other")], as, limits, busyOf(as), { blocked });
    expect(moves.length).toBeGreaterThan(0);
    expect(moves.every((m) => m.toFacultyId === "other")).toBe(true);
  });

  it("keeps moves inside the department when cross-department moves are off", () => {
    const as = [asg("a", "busy", 0), asg("b", "busy", 1), asg("c", "busy", 2), asg("d", "busy", 3)];
    const outsider = fac("out", { departmentId: "d2", specialization: "Programming" });
    expect(optimize([fac("busy"), outsider], as, limits, busyOf(as)).moves.length).toBeGreaterThan(0);
    const { moves, flags } = optimize([fac("busy"), outsider], as, { ...limits, crossDepartment: "DISALLOWED" }, busyOf(as));
    expect(moves).toHaveLength(0);
    expect(flags[0].kind).toBe("OVERLOADED");
  });

  it("evens out a department within the tolerance", () => {
    const roomy: WorkloadLimits = { measure: "HOURS", minimum: 0, maximum: 20, tolerance: 3 };
    const as = [asg("a", "high", 0), asg("b", "high", 1), asg("c", "high", 2), asg("d", "high", 3), asg("e", "high", 4), asg("f", "low", 0)];
    const { moves, loadsAfter } = optimize([fac("high", { maxHours: 40 }), fac("low", { maxHours: 40 })], as, roomy, busyOf(as));
    expect(moves.length).toBeGreaterThan(0);
    expect(Math.abs((loadsAfter.get("high") ?? 0) - (loadsAfter.get("low") ?? 0))).toBeLessThanOrEqual(6);
  });
});

describe("approval-time validation", () => {
  const as = [asg("a", "busy", 0), asg("b", "busy", 1), asg("c", "busy", 2), asg("d", "busy", 3), asg("e", "idle", 4)];
  const data = { faculty: [fac("busy"), fac("idle"), fac("full", { maxHours: 2 })], assignments: as, busy: busyOf(as), limits };

  it("returns the moves with live before and after loads", () => {
    const v = validateRows(data, [{ key: "a", fromFacultyId: "busy", toFacultyId: "idle" }]);
    expect(v.ok && v.moves[0]).toMatchObject({ fromBefore: 12, fromAfter: 9, toBefore: 3, toAfter: 6 });
  });

  it("refuses a stale row whose class changed hands", () => {
    const v = validateRows(data, [{ key: "a", fromFacultyId: "idle", toFacultyId: "busy" }]);
    expect(v.ok).toBe(false);
    expect(!v.ok && v.problems[0]).toMatch(/changed since it was proposed/);
  });

  it("refuses a receiver who would go over the maximum or is not free", () => {
    expect(validateRows(data, [{ key: "a", fromFacultyId: "busy", toFacultyId: "full" }]).ok).toBe(false);
    const clash = validateRows(data, [{ key: "e", fromFacultyId: "idle", toFacultyId: "busy" }]);
    expect(!clash.ok && clash.problems[0]).toMatch(/maximum|not free/);
  });

  it("changes the basis fingerprint when a class changes hands", () => {
    const moved = as.map((a) => (a.key === "a" ? { ...a, facultyId: "idle" } : a));
    expect(basisOf(as, ["busy", "idle"], limits)).not.toBe(basisOf(moved, ["busy", "idle"], limits));
    expect(basisOf(as, ["busy", "idle"], limits)).toBe(basisOf([...as].reverse(), ["idle", "busy"], limits));
  });
});
