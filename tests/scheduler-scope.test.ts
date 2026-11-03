import { describe, expect, it } from "vitest";
import { can, resolveProgramIds, scopeQuery, type PolicyUser } from "@/lib/permissions/policy";
import { fixedFilters, sanitizeFilters, scopedLevels, type FilterValues, type ScopeData } from "@/lib/scheduler/filter-scope";

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000);
const hod: PolicyUser = { id: "h", role: "HEAD_OF_DEPARTMENT", status: "ACTIVE", departmentIds: ["basic"], programIds: ["stem", "ict"] };

describe("program scope resolution", () => {
  const rows = [
    { programId: "stem", programDepartmentId: "basic", startDate: day(-5), endDate: null },
    { programId: "abm", programDepartmentId: "basic", startDate: day(-50), endDate: day(-1) },
    { programId: "bsit", programDepartmentId: "computing", startDate: day(-5), endDate: null },
    { programId: "ict", programDepartmentId: "basic", startDate: day(1), endDate: null },
  ];

  it("keeps only active rows inside the head's own department", () => {
    expect(resolveProgramIds(rows, ["basic"])).toEqual(["stem"]);
  });

  it("falls back to the whole department when no row is active", () => {
    expect(resolveProgramIds(rows.slice(1, 2), ["basic"])).toEqual([]);
  });
});

describe("program restricted policy", () => {
  it("limits record access to the assigned programs", () => {
    expect(can(hod, "edit", { type: "section", departmentId: "basic", programId: "stem" })).toBe(true);
    expect(can(hod, "view", { type: "section", departmentId: "basic", programId: "abm" })).toBe(false);
    expect(can(hod, "edit", { type: "schedule", departmentId: "basic", programId: null })).toBe(false);
    expect(can(hod, "edit", { type: "schedule", departmentId: "other", programId: "stem" })).toBe(false);
  });

  it("without a restriction the whole department stays available", () => {
    const whole = { ...hod, programIds: [] };
    expect(can(whole, "edit", { type: "section", departmentId: "basic", programId: "abm" })).toBe(true);
  });

  it("builds database filters limited to the programs", () => {
    expect(scopeQuery(hod, "section")).toEqual({ departmentId: { in: ["basic"] }, programId: { in: ["stem", "ict"] } });
    expect(scopeQuery(hod, "schedule")).toEqual({ section: { departmentId: { in: ["basic"] }, programId: { in: ["stem", "ict"] } } });
    expect(scopeQuery(hod, "program")).toEqual({ departmentId: { in: ["basic"] }, id: { in: ["stem", "ict"] } });
  });
});

const data: ScopeData = {
  departments: [{ id: "basic" }],
  programs: [{ id: "stem", level: "SENIOR_HIGH", departmentId: "basic" }, { id: "ict", level: "SENIOR_HIGH", departmentId: "basic" }],
  sections: [{ id: "s1", level: "SENIOR_HIGH" }, { id: "s2", level: "SENIOR_HIGH" }],
  terms: [{ id: "t1", level: "SENIOR_HIGH" }],
  faculty: [{ id: "f1" }],
  rooms: [{ id: "r1" }],
};
const blank: FilterValues = { level: "", departmentId: "", programId: "", yearLevel: "", gradeLevel: "", termId: "active", sectionId: "", facultyId: "", roomId: "" };

describe("scheduler filters stay inside the scope", () => {
  it("lists only the levels in scope and pre-selects a single one", () => {
    expect(scopedLevels(data)).toEqual(["SENIOR_HIGH"]);
    expect(fixedFilters(data).level).toBe("SENIOR_HIGH");
  });

  it("pre-selects the only program", () => {
    expect(fixedFilters({ ...data, programs: [data.programs[0]] }).programId).toBe("stem");
  });

  it("falls back to the default for stale or guessed address parameters", () => {
    const stale = { ...blank, level: "COLLEGE", programId: "abm", sectionId: "guessed", termId: "old", facultyId: "x", roomId: "y" };
    const clean = sanitizeFilters(stale, data);
    expect(clean).toMatchObject({ level: "SENIOR_HIGH", programId: "", sectionId: "", termId: "active", facultyId: "", roomId: "" });
  });

  it("keeps valid parameters", () => {
    expect(sanitizeFilters({ ...blank, programId: "ict", sectionId: "s2" }, data)).toMatchObject({ programId: "ict", sectionId: "s2" });
  });
});
