import { describe, expect, it } from "vitest";
import { collapseLanes, findConflicts } from "@/lib/calendar";

const item = (id: string, startMin: number, endMin: number) => ({ id, startMin, endMin });

describe("collapseLanes", () => {
  it("keeps small overlap groups side by side", () => {
    const { shown, overflow } = collapseLanes([item("a", 480, 570), item("b", 480, 600), item("c", 700, 760)], 3);
    expect(overflow).toEqual([]);
    expect(shown.get("a")?.lanes).toBe(2);
    expect(shown.get("c")).toEqual({ lane: 0, lanes: 1 });
  });

  it("folds the extra lanes of a crowded group into one +N more block", () => {
    const crowd = ["a", "b", "c", "d", "e"].map((id) => item(id, 480, 570));
    const { shown, overflow } = collapseLanes([...crowd, item("late", 900, 960)], 3);
    expect([...shown.keys()].filter((k) => k !== "late")).toHaveLength(2);
    expect(overflow).toEqual([{ startMin: 480, endMin: 570, lane: 2, lanes: 3, ids: ["c", "d", "e"] }]);
    expect(shown.get("late")).toEqual({ lane: 0, lanes: 1 });
  });
});

describe("findConflicts", () => {
  const ev = (id: string, startMin: number, endMin: number, r: { roomId?: string; facultyId?: string; sectionId?: string }, date = "2026-10-12") => ({ id, date, startMin, endMin, ...r });

  it("flags only overlapping items that share a resource", () => {
    const c = findConflicts([ev("a", 480, 570, { roomId: "r1", facultyId: "f1" }), ev("b", 540, 600, { roomId: "r1", facultyId: "f2" }), ev("c", 480, 570, { roomId: "r2", facultyId: "f3" })]);
    expect([...c.get("a")!]).toEqual(["ROOM"]);
    expect(c.has("b")).toBe(true);
    expect(c.has("c")).toBe(false);
  });

  it("ignores back-to-back items and other dates", () => {
    const c = findConflicts([ev("a", 480, 540, { sectionId: "s1" }), ev("b", 540, 600, { sectionId: "s1" }), ev("d", 480, 540, { sectionId: "s1" }, "2026-10-13")]);
    expect(c.size).toBe(0);
  });
});
