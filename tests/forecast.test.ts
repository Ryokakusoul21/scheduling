import { describe, expect, it } from "vitest";
import { facultyNeeded, gap, needsFor, predict, roomsNeeded } from "@/lib/forecast/forecast";

describe("enrollment forecast", () => {
  it("extends a clean linear trend with high confidence", () => {
    const history = [2019, 2020, 2021, 2022, 2023, 2024].map((year, i) => ({ year, termType: "FIRST", enrolled: 100 + i * 10 }));
    const p = predict(history, 2025, "FIRST")!;
    expect(p.value).toBe(160);
    expect(p.slope).toBe(10);
    expect(p.confidence).toBe("High");
    expect(p.low).toBeLessThanOrEqual(160);
  });

  it("lowers confidence for noisy or short histories and falls back to first-term data", () => {
    const noisy = [2021, 2022, 2023, 2024].map((year, i) => ({ year, termType: "FIRST", enrolled: [100, 160, 90, 170][i] }));
    expect(predict(noisy, 2025, "FIRST")!.confidence).toBe("Low");
    expect(predict(noisy, 2025, "SECOND")!.points).toBe(4);
    expect(predict([], 2025, "FIRST")).toBeNull();
  });

  it("turns students into sections, faculty, and rooms", () => {
    const n = needsFor(161, { sectionSize: 40, hoursPerSection: 20, laboratoryShare: 0.25 });
    expect(n).toEqual({ sections: 5, lectureHours: 75, laboratoryHours: 25 });
    expect(facultyNeeded(100, 24)).toBe(5);
    expect(roomsNeeded(100, 72, 0.75)).toBe(2);
    expect(gap(5, 3)).toEqual({ diff: -2, status: "SHORTAGE" });
  });
});
