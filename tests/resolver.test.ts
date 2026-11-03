import { describe, expect, it } from "vitest";
import { validatePlacement, placementAllowed } from "@/lib/scheduler/validate";
import { solve } from "@/lib/scheduler/resolver/solver";
import { applyChanges, checkSelection, introducedHard, revertChanges } from "@/lib/scheduler/resolver/changes";
import { countIssues, live, worldOf } from "@/lib/scheduler/resolver/issues";
import { DEFAULT_OPTIONS, type ResolverEntry, type ResolverInput, type ResolverOptions } from "@/lib/scheduler/resolver/types";
import type { ConstraintRule } from "@/lib/scheduler/constraints";

const room = (id: string, roomType: "LECTURE_ROOM" | "COMPUTER_LABORATORY", capacity = 40) => ({
  id, roomNumber: id, roomName: id, capacity, roomType, availability: [], status: "AVAILABLE" as const, programIds: null, assignable: true,
});
const faculty = (id: string) => ({ id, fullName: `Faculty ${id}`, maxHours: 24, availability: [], assignedHours: 0, teachingLevels: ["COLLEGE"], assignable: true });

/** Two sections, a lecture room, a computer laboratory, and two faculty members, all in one term. */
function fixture(patch: Partial<ResolverInput> = {}): ResolverInput {
  const sections = [
    { id: "s1", name: "BSIT 1-A", level: "COLLEGE", programId: null, departmentId: "d1", termId: "t1", studentCount: 30, editable: true, curriculum: [] as ResolverInput["sections"][number]["curriculum"] },
    { id: "s2", name: "BSIT 1-B", level: "COLLEGE", programId: null, departmentId: "d1", termId: "t1", studentCount: 30, editable: true, curriculum: [] as ResolverInput["sections"][number]["curriculum"] },
  ];
  const subjects = [
    { id: "it102", code: "IT102", name: "Programming", lectureHours: 0, labHours: 3, requiredRoomType: "COMPUTER_LABORATORY" as const },
    { id: "ge101", code: "GE101", name: "Purposive Communication", lectureHours: 3, labHours: 0, requiredRoomType: "LECTURE_ROOM" as const },
  ];
  const base: ResolverInput = {
    entries: [],
    sections,
    subjects,
    faculty: [faculty("f1"), faculty("f2")],
    rooms: [room("lec1", "LECTURE_ROOM"), room("lab1", "COMPUTER_LABORATORY")],
    rules: [],
    ruleCtx: {
      rooms: new Map([["lec1", { name: "lec1", capacity: 40, isGeneralShared: true, programIds: [] }], ["lab1", { name: "lab1", capacity: 40, isGeneralShared: true, programIds: [] }]]),
      sections: new Map(sections.map((s) => [s.id, { name: s.name, studentCount: s.studentCount, programId: null, departmentId: "d1" }])),
      subjects: new Map(subjects.map((s) => [s.id, { code: s.code, name: s.name }])),
      faculty: new Map([["f1", { name: "Faculty f1" }], ["f2", { name: "Faculty f2" }]]),
      programNames: new Map(),
    },
    termRanges: new Map([["t1", { start: 0, end: 1 }]]),
    bounds: { startMin: 7 * 60, endMin: 19 * 60 },
    step: 30,
  };
  return { ...base, ...patch };
}

function entry(id: string, patch: Partial<ResolverEntry> = {}): ResolverEntry {
  return { id, semesterId: "t1", sectionId: "s1", subjectId: "ge101", facultyId: "f1", roomId: "lec1", component: "LECTURE", dayOfWeek: "MONDAY", startMin: 480, endMin: 570, status: "DRAFT", ...patch };
}

const options = (patch: Partial<ResolverOptions> = {}): ResolverOptions => ({ ...DEFAULT_OPTIONS, sectionIds: ["s1", "s2"], timeLimitMs: 60_000, ...patch });

/** No change in a proposal may add a hard problem to the final timetable. */
function expectNoHardIntroduced(input: ResolverInput, changes: ReturnType<typeof solve>["changes"]) {
  const world = worldOf(input);
  const after = applyChanges(input.entries, changes);
  for (const c of changes) expect(introducedHard(c, input.entries, after, world)).toEqual([]);
}

describe("validatePlacement", () => {
  const world = worldOf(fixture());

  it("treats a laboratory component in a lecture room as hard", () => {
    const f = validatePlacement(entry("a", { subjectId: "it102", component: "LABORATORY" }), [], world);
    expect(placementAllowed(f)).toBe(false);
    expect(f.some((x) => x.source === "SUBJECT_REQUIREMENT_CONFLICT")).toBe(true);
  });

  it("treats a faculty double booking as a hard overlap", () => {
    const f = validatePlacement(entry("a", { sectionId: "s2", roomId: "lab1" }), [entry("b")], world);
    expect(f.some((x) => x.hard && x.overlap)).toBe(true);
  });

  it("keeps soft rules soft and ignores classes on other days", () => {
    const rules: ConstraintRule[] = [{ id: "lunch", kind: "LUNCH_BREAK", name: "Lunch", params: { startMin: 720, endMin: 780 }, departmentId: null }];
    const soft = worldOf(fixture({ rules }));
    const f = validatePlacement(entry("a", { startMin: 720, endMin: 810 }), [entry("b", { dayOfWeek: "TUESDAY", startMin: 720, endMin: 810 })], soft);
    expect(f).toHaveLength(1);
    expect(f[0].hard).toBe(false);
  });
});

describe("solve", () => {
  it("places an unscheduled laboratory in a laboratory room", () => {
    const input = fixture();
    input.sections[0].curriculum = [{ subjectId: "it102", component: "LABORATORY", requiredMin: 180 }];
    const p = solve(input, options());
    expect(p.before.unscheduled).toBe(1);
    expect(p.after.unscheduled).toBe(0);
    expect(p.changes).toHaveLength(1);
    expect(p.changes[0].after?.roomId).toBe("lab1");
    expectNoHardIntroduced(input, p.changes);
  });

  it("ends a faculty double booking with the least disruptive move", () => {
    const input = fixture({ entries: [entry("a"), entry("b", { sectionId: "s2", roomId: "lab1", subjectId: "ge101" })] });
    const p = solve(input, options());
    expect(p.before.conflicts).toBeGreaterThan(0);
    expect(p.after.conflicts).toBe(0);
    expectNoHardIntroduced(input, p.changes);
  });

  it("trims hours over the requirement, and flags a likely data problem instead of trimming", () => {
    const over = fixture({ entries: [entry("a", { endMin: 570 }), entry("b", { dayOfWeek: "TUESDAY", endMin: 570 }), entry("c", { dayOfWeek: "WEDNESDAY", endMin: 570 })] });
    over.sections[0].curriculum = [{ subjectId: "ge101", component: "LECTURE", requiredMin: 180 }];
    const trimmed = solve(over, options());
    expect(trimmed.changes.some((c) => c.type === "REMOVED" || c.type === "HOURS_ADJUSTED")).toBe(true);
    expect(trimmed.unresolved).toHaveLength(0);

    const double = fixture({ entries: [entry("a", { endMin: 480 + 360 })] });
    double.sections[0].curriculum = [{ subjectId: "ge101", component: "LECTURE", requiredMin: 180 }];
    const flagged = solve(double, options());
    expect(flagged.changes).toHaveLength(0);
    expect(flagged.unresolved[0].issue.dataProblem).toBe(true);
    expect(flagged.unresolved[0].link?.href).toBe("/subjects");
  });

  it("reports an impossible placement as unresolved without breaking a hard rule", () => {
    const input = fixture({ rooms: [room("lec1", "LECTURE_ROOM")] });
    input.sections[0].curriculum = [{ subjectId: "it102", component: "LABORATORY", requiredMin: 180 }];
    const p = solve(input, options());
    expect(p.changes).toHaveLength(0);
    expect(p.unresolved).toHaveLength(1);
    expect(p.unresolved[0].reason).toMatch(/laboratory/);
    expect(p.after.unscheduled).toBe(1);
  });

  it("gives the same proposal for the same input", () => {
    const make = () => {
      const input = fixture({ entries: [entry("a"), entry("b", { sectionId: "s2", roomId: "lab1" })] });
      input.sections[0].curriculum = [{ subjectId: "it102", component: "LABORATORY", requiredMin: 180 }, { subjectId: "ge101", component: "LECTURE", requiredMin: 180 }];
      input.sections[1].curriculum = [{ subjectId: "it102", component: "LABORATORY", requiredMin: 180 }];
      return input;
    };
    expect(solve(make(), options())).toEqual(solve(make(), options()));
  });

  it("stops at the iteration limit and returns its best partial proposal", () => {
    const input = fixture();
    input.sections[0].curriculum = [{ subjectId: "it102", component: "LABORATORY", requiredMin: 180 }, { subjectId: "ge101", component: "LECTURE", requiredMin: 180 }];
    const p = solve(input, options({ maxIterations: 1 }));
    expect(p.stoppedEarly).toBe(true);
    expect(p.unresolved.length).toBeGreaterThan(0);
    expectNoHardIntroduced(input, p.changes);
  });
});

describe("apply, select, and undo", () => {
  it("applies a proposal and undoes it back to the original timetable", () => {
    const input = fixture({ entries: [entry("a"), entry("b", { sectionId: "s2", roomId: "lab1" })] });
    input.sections[0].curriculum = [{ subjectId: "it102", component: "LABORATORY", requiredMin: 180 }, { subjectId: "ge101", component: "LECTURE", requiredMin: 90 }];
    const p = solve(input, options());
    expect(p.changes.length).toBeGreaterThan(0);
    const applied = applyChanges(input.entries, p.changes);
    expect(countIssues(input, applied, new Set(["s1", "s2"]))).toEqual(p.after);
    const undone = revertChanges(applied, p.changes);
    const byId = (list: ResolverEntry[]) => [...list].sort((a, b) => a.id.localeCompare(b.id));
    expect(byId(undone)).toEqual(byId(input.entries));
    expect(live(undone)).toHaveLength(2);
  });

  it("drops a whole group when one of its changes is rejected", () => {
    const input = fixture();
    const group = [
      { id: "x", type: "PLACED" as const, issueId: "i", group: "g", sectionId: "s1", before: null, after: entry("n1"), reason: "" },
      { id: "y", type: "MOVED" as const, issueId: "i", group: "g", sectionId: "s1", before: null, after: entry("n2", { dayOfWeek: "TUESDAY" }), reason: "" },
    ];
    const result = checkSelection(input, [], group, ["x"], new Set(["s1"]));
    expect(result.accepted).toEqual([]);
    expect(result.dropped).toEqual(["x", "y"]);
  });
});
