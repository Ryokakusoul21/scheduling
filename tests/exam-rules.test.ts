import { describe, expect, it } from "vitest";
import { checkExaminations, hasHardConflict, type ExamContext, type ExamSlot } from "@/lib/examinations/rules";

const slot = (id: string, over: Partial<ExamSlot> = {}): ExamSlot => ({ id, date: "2026-11-03", startMin: 480, endMin: 600, sectionId: `s-${id}`, roomId: `r-${id}`, proctorId: `p-${id}`, ...over });
const ctx: ExamContext = {
  window: { start: "2026-11-02", end: "2026-11-07" },
  blockedDates: new Map([["2026-11-05", "All Saints Day"]]),
  roomCapacity: new Map([["r-a", 30]]),
  sectionSize: new Map([["s-a", 40]]),
};
const codes = (slots: ExamSlot[], c = ctx) => checkExaminations(slots, c).map((i) => i.code);

describe("examination rules", () => {
  it("accepts a clean schedule", () => {
    expect(checkExaminations([slot("b")], ctx)).toEqual([]);
  });

  it("flags dates outside the window and on blocked days", () => {
    expect(codes([slot("b", { date: "2026-11-10" })])).toContain("OUTSIDE_WINDOW");
    expect(codes([slot("b", { date: "2026-11-05" })])).toContain("BLOCKED_DATE");
  });

  it("flags double-booked rooms, proctors, and sections", () => {
    const found = codes([slot("a"), slot("b", { roomId: "r-a", proctorId: "p-a", sectionId: "s-a" })]);
    expect(found).toEqual(expect.arrayContaining(["ROOM_CONFLICT", "PROCTOR_CONFLICT", "SECTION_CONFLICT"]));
  });

  it("flags a room that is too small", () => {
    expect(codes([slot("a")])).toContain("CAPACITY");
  });

  it("warns about a short gap and the lunch break but does not block", () => {
    const issues = checkExaminations([slot("b", { sectionId: "s", endMin: 600 }), slot("c", { sectionId: "s", startMin: 615, endMin: 700 }), slot("d", { startMin: 700, endMin: 760 })], ctx);
    expect(issues.map((i) => i.code)).toEqual(expect.arrayContaining(["BUFFER", "LUNCH"]));
    expect(hasHardConflict(issues)).toBe(false);
  });

  it("limits examinations per section per day", () => {
    const many = [0, 1, 2, 3].map((n) => slot(`m${n}`, { sectionId: "s", startMin: 420 + n * 150, endMin: 540 + n * 150 }));
    expect(codes(many)).toContain("MAX_PER_DAY");
  });

  it("treats other departments' examinations as busy rooms only", () => {
    const busy = [slot("x", { roomId: "r-b", proctorId: "", sectionId: "busy-x" })];
    const issues = checkExaminations([slot("b")], { ...ctx, busy });
    expect(issues.map((i) => i.code)).toEqual(["ROOM_CONFLICT"]);
    expect(issues[0].message).toBe("The room is busy at this time.");
  });
});
