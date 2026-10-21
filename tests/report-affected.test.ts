import { describe, expect, it } from "vitest";
import { activityApplies, affectsOf, type ReportActivity, type ReportClass } from "@/lib/reports/affected";

// A Monday class from 8:00 AM to 9:30 AM in a term covering October 2026.
const cls: ReportClass = {
  sectionId: "s1", departmentId: "d1", level: "COLLEGE", dayOfWeek: "MONDAY", startMin: 480, endMin: 570,
  termStart: "2026-10-01", termEnd: "2026-10-31",
};

const act = (over: Partial<ReportActivity>): ReportActivity => ({
  id: "a", type: "SCHOOL_EVENT", title: "Event", startDate: "2026-10-12", endDate: "2026-10-12",
  startMin: null, endMin: null, departmentId: null, level: null, sectionIds: [], ...over,
});

describe("activityApplies", () => {
  it("applies holidays to every class", () => {
    expect(activityApplies(act({ type: "HOLIDAY", departmentId: "other" }), cls)).toBe(true);
  });

  it("applies suspensions only to listed sections, or to all when none are listed", () => {
    expect(activityApplies(act({ type: "CLASS_SUSPENSION", sectionIds: ["s2"] }), cls)).toBe(false);
    expect(activityApplies(act({ type: "CLASS_SUSPENSION", sectionIds: ["s1"] }), cls)).toBe(true);
    expect(activityApplies(act({ type: "CLASS_SUSPENSION" }), cls)).toBe(true);
  });

  it("matches events by department, school level, and overlapping time", () => {
    expect(activityApplies(act({ departmentId: "d2" }), cls)).toBe(false);
    expect(activityApplies(act({ level: "SENIOR_HIGH" }), cls)).toBe(false);
    expect(activityApplies(act({ startMin: 600, endMin: 660 }), cls)).toBe(false);
    expect(activityApplies(act({ departmentId: "d1", startMin: 540, endMin: 600 }), cls)).toBe(true);
  });
});

describe("affectsOf", () => {
  it("lists only meeting days inside the term", () => {
    // Runs Saturday October 10 to Tuesday November 3; the class meets on Mondays October 12, 19, 26 (November 2 is past the term).
    const list = affectsOf(cls, [act({ title: "Sports Week", startDate: "2026-10-10", endDate: "2026-11-03" })]);
    expect(list.map((a) => a.date)).toEqual(["2026-10-12", "2026-10-19", "2026-10-26"]);
  });

  it("ignores activities on days the class does not meet", () => {
    expect(affectsOf(cls, [act({ startDate: "2026-10-13", endDate: "2026-10-13" })])).toEqual([]);
  });
});
