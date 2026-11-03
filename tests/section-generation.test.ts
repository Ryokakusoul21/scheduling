import { describe, expect, it } from "vitest";
import { distributeLearners, generateSectionNames, sectionSuffix, sectionSummary } from "@/lib/sections/generation";
import { parseSectionFilters } from "@/lib/sections/filters";

describe("section cohort generation", () => {
  it("distributes 106 learners across a maximum of 40", () => expect(distributeLearners(106, 40)).toEqual([36, 35, 35]));
  it("handles exact multiples", () => expect(distributeLearners(80, 40)).toEqual([40, 40]));
  it("handles one learner", () => expect(distributeLearners(1, 40)).toEqual([1]));
  it("handles a maximum larger than the cohort", () => expect(distributeLearners(30, 40)).toEqual([30]));
  it("continues after existing sections", () => expect(generateSectionNames("BSIT", 1, 2, 1)).toEqual(["BSIT 1-B", "BSIT 1-C"]));
  it("continues after the highest existing suffix even with gaps", async () => { const { nextSectionIndex } = await import("@/lib/sections/generation"); expect(nextSectionIndex(["BSIT 1-A", "BSIT 1-C"])).toBe(3); });
  it("continues past Z", () => { expect(sectionSuffix(25)).toBe("Z"); expect(sectionSuffix(26)).toBe("AA"); expect(sectionSuffix(27)).toBe("AB"); });
  it("counts only supplied term rows", () => expect(sectionSummary([{ studentCount: 36 }, { studentCount: 35 }, { studentCount: 35 }])).toEqual({ sections: 3, learners: 106 }));
  it("falls back for invalid term filters", () => expect(parseSectionFilters({ year: "bad", semester: "3", status: "BAD" }, { year: "2026-2027", semester: "1", years: ["2026-2027"] })).toMatchObject({ year: "2026-2027", semester: "1", status: "ACTIVE" }));
});
