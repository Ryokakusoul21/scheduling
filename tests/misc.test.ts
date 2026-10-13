import { describe, expect, it } from "vitest";
import { rankFaculty, rankRooms } from "@/lib/scheduler/suggest";
import { ANY_YEAR, GENERAL, flowHref, isComplete, parseFlow } from "@/lib/academics/flow";
import { LEVELS, levelForGrade, stageLabel, termTypesFor } from "@/lib/academics/levels";
import { canAccessPath, rolesForPath } from "@/lib/permissions/routes";
import { NAV_GROUPS, filterNavForRole } from "@/components/layout/nav-config";
import { ROLES } from "@/lib/permissions/roles";
import { eventToKey } from "@/lib/keyboard";

const slot = { dayOfWeek: "MONDAY" as const, startMin: 480, endMin: 570 };

describe("suggestions", () => {
  it("ranks free, available faculty who teach the level first", () => {
    const ranked = rankFaculty(
      [
        { id: "busy", teachingLevels: ["COLLEGE"], availability: [] },
        { id: "other-level", teachingLevels: ["ELEMENTARY"], availability: [] },
        { id: "best", teachingLevels: ["COLLEGE"], availability: [] },
      ],
      slot,
      [{ ...slot, facultyId: "busy", roomId: "x" }],
      "COLLEGE"
    );
    expect(ranked.map((r) => r.id)).toEqual(["best", "other-level", "busy"]);
    expect(ranked[2].notes).toContain("busy");
  });

  it("prefers rooms that are free, open, big enough, and the right type", () => {
    const ranked = rankRooms(
      [
        { id: "small", capacity: 20, roomType: "LECTURE_ROOM", status: "AVAILABLE" },
        { id: "lab", capacity: 40, roomType: "COMPUTER_LABORATORY", status: "AVAILABLE" },
        { id: "ok", capacity: 40, roomType: "LECTURE_ROOM", status: "AVAILABLE" },
      ],
      slot,
      [],
      { studentCount: 35, component: "LECTURE" }
    );
    expect(ranked[0].id).toBe("ok");
  });
});

describe("level helpers", () => {
  it("uses semesters for College and quarters for basic education", () => {
    expect(termTypesFor("COLLEGE")).toContain("FIRST");
    expect(termTypesFor("ELEMENTARY")).toEqual(["QUARTER_1", "QUARTER_2", "QUARTER_3", "QUARTER_4"]);
  });
  it("covers Kindergarten to Grade 12 exactly once", () => {
    const grades = Object.values(LEVELS).flatMap((l) => l.grades);
    expect(grades).toHaveLength(13);
    expect(new Set(grades).size).toBe(13);
    expect(levelForGrade("KINDER")).toBe("ELEMENTARY");
    expect(levelForGrade("GRADE_10")).toBe("JUNIOR_HIGH");
    expect(levelForGrade("GRADE_12")).toBe("SENIOR_HIGH");
  });
  it("labels sections by year or grade", () => {
    expect(stageLabel({ level: "COLLEGE", yearLevel: "SECOND" })).toBe("Second Year");
    expect(stageLabel({ level: "ELEMENTARY", gradeLevel: "KINDER" })).toBe("Kindergarten");
  });
});

describe("card-flow URL state", () => {
  it("completes College at program + year and basic ed at grade", () => {
    expect(isComplete(parseFlow({ level: "COLLEGE", program: "p1" }))).toBe(false);
    expect(isComplete(parseFlow({ level: "COLLEGE", program: GENERAL, year: ANY_YEAR }))).toBe(true);
    expect(isComplete(parseFlow({ level: "JUNIOR_HIGH", grade: "GRADE_7" }))).toBe(true);
  });
  it("drops a grade that doesn't belong to the level", () => {
    expect(parseFlow({ level: "JUNIOR_HIGH", grade: "GRADE_11" }).grade).toBeNull();
  });
  it("round-trips through flowHref", () => {
    const href = flowHref("/sections", { level: "SENIOR_HIGH", grade: "GRADE_11", strand: "stem" });
    const params = Object.fromEntries(new URL(href, "http://x").searchParams);
    expect(parseFlow(params)).toMatchObject({ level: "SENIOR_HIGH", grade: "GRADE_11", strand: "stem" });
  });
});

describe("RBAC route guards", () => {
  it("restricts admin and setup pages", () => {
    expect(canAccessPath("/admin/users", "HEAD_OF_DEPARTMENT")).toBe(false);
    expect(canAccessPath("/admin/users", "ADMINISTRATOR")).toBe(true);
    expect(canAccessPath("/rooms", "FACULTY")).toBe(false);
    expect(canAccessPath("/rooms/anything", "HEAD_OF_DEPARTMENT")).toBe(true);
    expect(canAccessPath("/bookings", "FACULTY")).toBe(true);
    expect(canAccessPath("/roomsXYZ", "FACULTY")).toBe(true); // prefix match is per path segment
    expect(rolesForPath("/scheduler")).toBeNull();
  });

  it("matches the sidebar: a role can open a page exactly when its sidebar links to it", () => {
    const hrefs = [...new Set(NAV_GROUPS.flatMap((g) => g.items.map((i) => i.href)))];
    for (const role of ROLES) {
      const visible = filterNavForRole(role).flatMap((g) => g.items.map((i) => i.href));
      for (const href of hrefs) expect(canAccessPath(href, role), `${role} ${href}`).toBe(visible.includes(href));
    }
  });
});

describe("keyboard shortcuts", () => {
  const ev = (key: string, mods: Partial<Record<"ctrlKey" | "metaKey" | "altKey" | "shiftKey", boolean>> = {}) => ({
    key,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    ...mods,
  });
  it("normalises keys and modifiers", () => {
    expect(eventToKey(ev("N"))).toBe("n");
    expect(eventToKey(ev("?", { shiftKey: true }))).toBe("?");
    expect(eventToKey(ev("k", { ctrlKey: true }))).toBe("mod+k");
    expect(eventToKey(ev("k", { metaKey: true }))).toBe("mod+k");
    expect(eventToKey(ev("ArrowDown", { shiftKey: true }))).toBe("shift+arrowdown");
    expect(eventToKey(ev("Escape"))).toBe("escape");
  });
});
