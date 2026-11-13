import { describe, expect, it } from "vitest";
import { distributeLearners, generateSectionNames, planSectionGeneration, sectionSuffix, sectionSummary } from "@/lib/sections/generation";
import { parseSectionFilters } from "@/lib/sections/filters";

describe("section cohort generation", () => {
  it("distributes 106 learners across a maximum of 40", () => expect(distributeLearners(106, 40)).toEqual([36, 35, 35]));
  it("handles exact multiples", () => expect(distributeLearners(80, 40)).toEqual([40, 40]));
  it("fills sections to the maximum when balancing is off", () => expect(distributeLearners(106, 40, false)).toEqual([40, 40, 26]));
  it("handles one learner", () => expect(distributeLearners(1, 40)).toEqual([1]));
  it("handles a maximum larger than the cohort", () => expect(distributeLearners(30, 40)).toEqual([30]));
  it("continues after existing sections", () => expect(generateSectionNames("BSIT", 1, 2, 1)).toEqual(["BSIT 1-B", "BSIT 1-C"]));
  it("continues after the highest existing suffix even with gaps", async () => { const { nextSectionIndex } = await import("@/lib/sections/generation"); expect(nextSectionIndex(["BSIT 1-A", "BSIT 1-C"])).toBe(3); });
  it("continues past Z", () => { expect(sectionSuffix(25)).toBe("Z"); expect(sectionSuffix(26)).toBe("AA"); expect(sectionSuffix(27)).toBe("AB"); });
  it("counts only supplied term rows", () => expect(sectionSummary([{ studentCount: 36 }, { studentCount: 35 }, { studentCount: 35 }])).toEqual({ sections: 3, learners: 106 }));
  it("falls back for invalid term filters", () => expect(parseSectionFilters({ year: "bad", semester: "3", status: "BAD" }, { year: "2026-2027", semester: "1", years: ["2026-2027"] })).toMatchObject({ year: "2026-2027", semester: "1", status: "ACTIVE" }));
});

describe("section generation plans", () => {
  const existing = [
    { id: "a", name: "BSIT 1-A", studentCount: 30, enrolledStudents: 0 },
    { id: "b", name: "BSIT 1-B", studentCount: 30, enrolledStudents: 0 },
  ];
  const input = { totalLearners: 106, maximum: 40, balanced: true, mode: "ADD" as const, prefix: "BSIT", yearNumber: 1 };

  it("accounts for actual existing counts and balances only the remaining students in add-only mode", () => {
    const plan = planSectionGeneration(input, existing, existing.map((s) => s.name));
    expect(plan).toMatchObject({ ok: true, total: 106, unchanged: 2, created: 2, updated: 0, currentTotal: 60, remaining: 46 });
    expect(plan.rows.map((r) => [r.name, r.current, r.proposed, r.status])).toEqual([
      ["BSIT 1-A", 30, 30, "UNCHANGED"], ["BSIT 1-B", 30, 30, "UNCHANGED"],
      ["BSIT 1-C", null, 23, "NEW"], ["BSIT 1-D", null, 23, "NEW"],
    ]);
  });

  it("fills only new sections when balance is disabled", () => {
    expect(planSectionGeneration({ ...input, balanced: false }, existing, existing.map((s) => s.name)).rows.map((r) => r.proposed)).toEqual([30, 30, 40, 6]);
  });

  it("rebalances the whole cohort while preserving existing section names and IDs", () => {
    const plan = planSectionGeneration({ ...input, mode: "REBALANCE" }, existing, existing.map((s) => s.name));
    expect(plan).toMatchObject({ ok: true, total: 106, updated: 2, created: 1 });
    expect(plan.rows.map((r) => [r.id, r.name, r.proposed])).toEqual([["a", "BSIT 1-A", 36], ["b", "BSIT 1-B", 35], [null, "BSIT 1-C", 35]]);
  });

  it("reserves archived names and continues beyond gaps and Z", () => {
    const plan = planSectionGeneration(input, existing, ["BSIT 1-A", "BSIT 1-B", "BSIT 1-Z"]);
    expect(plan.rows.filter((r) => r.status === "NEW").map((r) => r.name)).toEqual(["BSIT 1-AA", "BSIT 1-AB"]);
  });

  it("does not force new sections or alter existing sections when all students are already counted", () => {
    expect(planSectionGeneration({ ...input, totalLearners: 60 }, existing, [])).toMatchObject({ ok: true, created: 0, updated: 0, total: 60 });
  });

  it("rejects an add-only total below existing counts", () => {
    expect(planSectionGeneration({ ...input, totalLearners: 59 }, existing, [])).toMatchObject({ ok: false, error: expect.stringContaining("60 students") });
  });

  it("retains extra existing sections when rebalancing instead of deleting or renaming them", () => {
    const plan = planSectionGeneration({ ...input, mode: "REBALANCE", totalLearners: 20 }, existing, []);
    expect(plan.rows.map((r) => [r.id, r.proposed])).toEqual([["a", 10], ["b", 10]]);
  });

  it("refuses proposed counts below actual enrollment without moving any students", () => {
    expect(planSectionGeneration({ ...input, mode: "REBALANCE" }, [{ ...existing[0], enrolledStudents: 40 }, existing[1]], [])).toMatchObject({ ok: false, error: expect.stringContaining("40 enrolled students") });
  });

  it.each([{ totalLearners: 0 }, { totalLearners: 2.5 }, { maximum: 0 }, { maximum: 1.5 }, { totalLearners: 10001 }])("rejects invalid planning values %j", (invalid) => {
    expect(planSectionGeneration({ ...input, ...invalid }, [], []).ok).toBe(false);
  });

  it("preserves every student and respects the maximum across both distributions and generation modes", () => {
    for (const mode of ["ADD", "REBALANCE"] as const) for (const balanced of [true, false]) {
      for (let total = 60; total <= 180; total += 7) {
        const plan = planSectionGeneration({ ...input, totalLearners: total, mode, balanced }, existing, []);
        expect(plan.ok).toBe(true);
        expect(plan.rows.reduce((sum, r) => sum + r.proposed, 0)).toBe(total);
        expect(plan.rows.every((r) => r.proposed <= input.maximum && r.proposed >= 0)).toBe(true);
        const distributed = mode === "ADD" ? plan.rows.filter((r) => r.status === "NEW") : plan.rows;
        if (balanced && distributed.length) expect(Math.max(...distributed.map((r) => r.proposed)) - Math.min(...distributed.map((r) => r.proposed))).toBeLessThanOrEqual(1);
      }
    }
  });
});
