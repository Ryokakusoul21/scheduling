import { describe, expect, it } from "vitest";
import { departmentLevels, initialPolicyPeriod, scopedPolicyOptions } from "@/lib/scheduler/policy-options";
import { policyMatches } from "@/lib/scheduler/class-policies";
import { policyOptionsFixture } from "./fixtures/policy-options";

describe("department and academic-period policy options", () => {
  it("shows only college terms and resources for the computing department", () => {
    const scoped = scopedPolicyOptions(policyOptionsFixture(), "cs", { termId: "term" }, "year");
    expect(scoped.levels).toEqual(["COLLEGE"]);
    expect(scoped.terms.map((t) => t.value)).toEqual(["term", "second"]);
    expect(scoped.grades).toEqual([]);
    expect(scoped.programs.map((p) => p.value)).toEqual(["bsit", "bscs"]);
    expect(scoped.sections.map((s) => s.value)).toEqual(["section", "section-b"]);
    expect(scoped.subjects.map((s) => s.value)).toEqual(["ge", "it"]);
    expect(scoped.classes.map((s) => s.value)).toEqual(["meeting", "meeting-b"]);
  });

  it("limits SHS to its strands and grades 11-12", () => {
    const scoped = scopedPolicyOptions(policyOptionsFixture(), "shs", {}, "year");
    expect(scoped.levels).toEqual(["SENIOR_HIGH"]);
    expect(scoped.terms.map((t) => t.value)).toEqual(["quarter"]);
    expect(scoped.programs.map((p) => p.value)).toEqual(["stem"]);
    expect(scoped.grades).toEqual(["GRADE_11", "GRADE_12"]);
    expect(scoped.classes.map((c) => c.value)).toEqual(["shs-meeting"]);
  });

  it("infers pre-elementary and elementary levels even without college-style programs", () => {
    expect(departmentLevels("PRE-ELEM", "Pre-Elementary Department", [])).toEqual(["PRE_ELEMENTARY"]);
    expect(scopedPolicyOptions(policyOptionsFixture(), "pre").grades).toEqual(["NURSERY", "PREPARATORY", "KINDER"]);
    expect(scopedPolicyOptions(policyOptionsFixture(), "elem").grades).toEqual(["GRADE_1", "GRADE_2", "GRADE_3", "GRADE_4", "GRADE_5", "GRADE_6"]);
  });

  it("defaults to the active academic period and preserves an explicitly edited historical term", () => {
    expect(initialPolicyPeriod(policyOptionsFixture(), "cs")).toEqual({ academicYearId: "year", termId: "term" });
    expect(initialPolicyPeriod(policyOptionsFixture(), "cs", "old")).toEqual({ academicYearId: "old-year", termId: "old" });
    expect(initialPolicyPeriod(policyOptionsFixture(), "shs")).toEqual({ academicYearId: "year", termId: "quarter" });
  });

  it("narrows specific classes by section curriculum and minor/major category", () => {
    const scoped = scopedPolicyOptions(policyOptionsFixture(), "cs", { sectionId: "section-b", subjectCategory: "MINOR", termId: "term" }, "year");
    expect(scoped.subjects.map((s) => s.value)).toEqual(["ge"]);
    expect(scoped.classes.map((c) => c.value)).toEqual(["meeting-b"]);
  });

  it("applies one rule to selected sections without reaching other department classes", () => {
    const rule = { id: "rule", kind: "DELIVERY_MODE", departmentId: "cs", params: { target: { sectionIds: ["section", "section-b"] } } };
    const entry = { sectionId: "section", subjectId: "ge", component: "LECTURE" };
    expect(policyMatches(rule, entry, { departmentId: "cs" })).toBe(true);
    expect(policyMatches(rule, { ...entry, sectionId: "section-b" }, { departmentId: "cs" })).toBe(true);
    expect(policyMatches(rule, { ...entry, sectionId: "other" }, { departmentId: "cs" })).toBe(false);
    expect(policyMatches(rule, entry, { departmentId: "shs" })).toBe(false);
  });

  it("returns no resources for an unrecognized department", () => {
    const scoped = scopedPolicyOptions(policyOptionsFixture(), "foreign");
    expect(scoped.terms).toEqual([]);
    expect(scoped.programs).toEqual([]);
    expect(scoped.subjects).toEqual([]);
    expect(scoped.classes).toEqual([]);
  });
});
