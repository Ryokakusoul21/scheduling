import { describe, expect, it } from "vitest";
import { applyChanges, loadTone, planSchema, projectedLoads, type PlanSubject } from "@/lib/subjects/plan";
import { specializationMatch } from "@/lib/subjects/match";
import { attentionReason, matchesStatus, toCsv } from "@/lib/subjects/status";
import type { AssignableFaculty } from "@/lib/subjects/assignment-rules";

const fac = (id: string, load: number, limit = 24): AssignableFaculty => ({
  id, name: id, email: `${id}@x`, employeeId: id, departmentId: "d", departmentName: "D", specialization: null,
  employmentType: "FULL_TIME", load, minimum: 6, limit, unavailability: [],
});
const subject = (assignments: PlanSubject["assignments"]): PlanSubject => ({
  id: "s", code: "ITC101", units: 3, lectureHours: 3, labHours: 0, departmentId: "d", departmentName: "D", assignments,
});

describe("applyChanges", () => {
  it("replaces and removes per section, last change winning", () => {
    const next = applyChanges([{ facultyId: "a", sectionId: "s1" }], [
      { sectionId: "s1", facultyId: "b" },
      { sectionId: "s2", facultyId: "c" },
      { sectionId: "s2", facultyId: null },
    ]);
    expect([...next]).toEqual([["s1", "b"]]);
  });
});

describe("projectedLoads", () => {
  it("moves a subject's load from the old teacher to the new one", () => {
    const loads = projectedLoads([fac("a", 19), fac("b", 10)], [subject([{ facultyId: "a", sectionId: null }])], [{ sectionId: null, facultyId: "b" }], "HOURS");
    expect(loads.get("a")).toMatchObject({ before: 19, after: 16 });
    expect(loads.get("b")).toMatchObject({ before: 10, after: 13 });
  });
  it("counts a subject once for someone teaching several sections", () => {
    const loads = projectedLoads([fac("b", 10)], [subject([])], [{ sectionId: "s1", facultyId: "b" }, { sectionId: "s2", facultyId: "b" }], "HOURS");
    expect(loads.get("b")?.after).toBe(13);
  });
  it("leaves unaffected faculty out", () => {
    expect(projectedLoads([fac("z", 5)], [subject([])], [{ sectionId: null, facultyId: "b" }], "HOURS").size).toBe(0);
  });
});

describe("loadTone", () => {
  it("is green under 75%, amber to the limit, red at or over it", () => {
    expect(loadTone(17, 24)).toBe("ok");
    expect(loadTone(18, 24)).toBe("warn");
    expect(loadTone(24, 24)).toBe("full");
    expect(loadTone(30, 24)).toBe("full");
  });
});

describe("planSchema", () => {
  it("turns a blank section into null and requires a change", () => {
    expect(planSchema.parse({ subjectIds: ["s"], semesterId: "t", changes: [{ sectionId: "", facultyId: "f" }] }).changes[0].sectionId).toBeNull();
    expect(planSchema.safeParse({ subjectIds: ["s"], semesterId: "t", changes: [] }).success).toBe(false);
  });
});

describe("specializationMatch", () => {
  const web = { code: "ITC201", name: "Web Systems and Technologies", description: "" };
  it("matches a phrase or a shared word, and ignores empty or unrelated input", () => {
    expect(specializationMatch("Web Development, Databases", web)).toBe(true);
    expect(specializationMatch("Accounting", web)).toBe(false);
    expect(specializationMatch(null, web)).toBe(false);
    expect(specializationMatch("IT", web)).toBe(false);
  });
});

describe("subject status helpers", () => {
  const people = new Map([["full", { load: 24, limit: 24, unavailability: [] }], ["away", { load: 5, limit: 24, unavailability: ["Nov 4 to Nov 8 (Leave)"] }], ["ok", { load: 5, limit: 24, unavailability: [] }]]);
  const row = (ids: string[], request: { status: string } | null = null) => ({ assignments: ids.map((facultyId) => ({ facultyId })), request });

  it("flags unassigned subjects and teachers at their limit or away", () => {
    expect(attentionReason(row([]), people)).toBe("Nobody is assigned");
    expect(attentionReason(row(["full"]), people)).toMatch(/maximum load/);
    expect(attentionReason(row(["away"]), people)).toMatch(/unavailability/);
    expect(attentionReason(row(["ok"]), people)).toBeNull();
  });
  it("filters by status", () => {
    expect(matchesStatus("UNASSIGNED", row([]), people)).toBe(true);
    expect(matchesStatus("ASSIGNED", row([]), people)).toBe(false);
    expect(matchesStatus("REQUEST", row(["ok"], { status: "PENDING" }), people)).toBe(true);
    expect(matchesStatus("REQUEST", row(["ok"], { status: "APPROVED" }), people)).toBe(false);
  });
  it("quotes CSV cells", () => {
    expect(toCsv(["a", "b"], [['x "y"', 2]])).toBe('"a","b"\r\n"x ""y""","2"');
  });
});
