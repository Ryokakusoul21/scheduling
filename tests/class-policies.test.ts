import { describe, expect, it } from "vitest";
import { deliveryPolicy, deliveryPolicySchema, durationPolicy, policyMatches, splitPolicyMinutes } from "@/lib/scheduler/class-policies";
import { checkEntry, type ConstraintContext, type ConstraintRule } from "@/lib/scheduler/constraints";
import { detectConflicts } from "@/lib/scheduler/conflictDetector";
import type { SchedEntry } from "@/lib/scheduler/types";

const section = { departmentId: "computing", level: "COLLEGE", programId: "bsit", yearLevel: "FIRST", gradeLevel: null };
const subject = { category: "MINOR", lectureHours: 3, labHours: 0 };
const entry: SchedEntry = { id: "meeting", semesterId: "term", sectionId: "section", subjectId: "subject", component: "LECTURE", facultyId: "faculty", roomId: "", deliveryMode: "ONLINE_LIVE", dayOfWeek: "MONDAY", startMin: 480, endMin: 570 };
function delivery(target = {}, modes = ["ONLINE_LIVE"], defaultMode = "ONLINE_LIVE"): ConstraintRule {
  return { id: "delivery", name: "Online minor classes", kind: "DELIVERY_MODE", departmentId: "computing", params: { target, allowedModes: modes, defaultMode } };
}
const context = (): ConstraintContext => ({
  sections: new Map([["section", { ...section, name: "BSIT 1A", studentCount: 30, programId: "bsit" }]]),
  subjects: new Map([["subject", { ...subject, code: "GE101", name: "General Education" }]]),
  rooms: new Map(), faculty: new Map(), programNames: new Map(),
});

describe("scoped class delivery and duration policies", () => {
  it("intersects program, year, minor category, section and term filters", () => {
    const rule = delivery({ termId: "term", programId: "bsit", yearLevel: "FIRST", subjectCategory: "MINOR", sectionId: "section" });
    expect(policyMatches(rule, entry, section, subject)).toBe(true);
    expect(policyMatches(rule, entry, { ...section, yearLevel: "SECOND" }, subject)).toBe(false);
    expect(policyMatches(rule, entry, section, { ...subject, category: "MAJOR" })).toBe(false);
    expect(policyMatches(rule, { ...entry, semesterId: "another-term" }, section, subject)).toBe(false);
    expect(policyMatches(rule, entry, { ...section, departmentId: "business" }, subject)).toBe(false);
  });

  it("can target the class (section and subject), or a single saved meeting", () => {
    expect(policyMatches(delivery({ sectionId: "section", subjectId: "subject" }), entry, section, subject)).toBe(true);
    expect(policyMatches(delivery({ classId: "meeting" }), entry, section, subject)).toBe(true);
    expect(policyMatches(delivery({ classId: "another-meeting" }), entry, section, subject)).toBe(false);
  });

  it.each(["SENIOR_HIGH", "JUNIOR_HIGH", "ELEMENTARY", "PRE_ELEMENTARY"])("supports a %s target", (level) => {
    expect(policyMatches({ ...delivery({ level }), departmentId: null }, entry, { ...section, level }, subject)).toBe(true);
    expect(policyMatches({ ...delivery({ level }), departmentId: null }, entry, section, subject)).toBe(false);
  });

  it("lets a narrower target choose a default while preserving broad required restrictions", () => {
    const broad = { ...delivery({}, ["IN_PERSON", "ONLINE_LIVE"], "IN_PERSON"), id: "broad", departmentId: null };
    const narrow = delivery({ sectionId: "section", subjectCategory: "MINOR" }, ["IN_PERSON", "ONLINE_LIVE"], "ONLINE_LIVE");
    expect(deliveryPolicy([broad, narrow], entry, section, subject)).toMatchObject({ defaultMode: "ONLINE_LIVE", conflicting: false });
    const restricted = { ...broad, params: { target: {}, allowedModes: ["IN_PERSON"], defaultMode: "IN_PERSON" } };
    expect(deliveryPolicy([restricted, narrow], entry, section, subject)).toMatchObject({ allowed: ["IN_PERSON"], defaultMode: "IN_PERSON" });
    expect(deliveryPolicy([restricted, delivery()], entry, section, subject).conflicting).toBe(true);
  });

  it("rejects a default mode excluded from the allowed choices", () => {
    expect(deliveryPolicySchema.safeParse({ target: {}, allowedModes: ["IN_PERSON"], defaultMode: "ONLINE_LIVE" }).success).toBe(false);
  });

  it("enforces delivery and meeting length on both class components", () => {
    const rule: ConstraintRule = { id: "length", name: "90 minute lectures", departmentId: "computing", kind: "CLASS_DURATION", params: { target: { component: "LECTURE" }, allowedMinutes: [90], allowFinalRemainder: false } };
    expect(checkEntry(entry, [], [delivery(), rule], context())).toHaveLength(0);
    expect(checkEntry({ ...entry, endMin: 540 }, [], [rule], context())).toMatchObject([{ kind: "CLASS_DURATION", hard: true }]);
    expect(checkEntry({ ...entry, deliveryMode: "IN_PERSON", roomId: "room" }, [], [delivery()], context())).toMatchObject([{ kind: "DELIVERY_MODE", hard: true }]);
    expect(checkEntry({ ...entry, component: "LABORATORY", endMin: 540 }, [], [rule], context())).toHaveLength(0);
  });

  it("counts meetings on other days when allowing the final shorter remainder", () => {
    const rule: ConstraintRule = { id: "length", name: "Duration", departmentId: null, kind: "CLASS_DURATION", params: { target: {}, allowedMinutes: [120], allowFinalRemainder: true } };
    const previous = { ...entry, id: "previous", dayOfWeek: "TUESDAY" as const, startMin: 480, endMin: 600 };
    expect(checkEntry({ ...entry, endMin: 540 }, [previous], [rule], context())).toHaveLength(0);
    expect(checkEntry({ ...entry, endMin: 510 }, [previous], [rule], context())).toHaveLength(1);
    expect(durationPolicy([rule], entry, section, subject)?.allowedMinutes).toEqual([120]);
  });

  it("splits weekly requirements exactly and only uses a remainder when allowed", () => {
    expect(splitPolicyMinutes(180, [60, 90], false)).toEqual([90, 90]);
    expect(splitPolicyMinutes(240, [90, 120], false)).toEqual([120, 120]);
    expect(splitPolicyMinutes(150, [90], false)).toBeNull();
    expect(splitPolicyMinutes(150, [90], true)).toEqual([90, 60]);
    expect(splitPolicyMinutes(180, [], true)).toBeNull();
  });

  it("does not double-book a physical room for two unrelated online classes", () => {
    const other = { ...entry, id: "other", facultyId: "other-faculty", sectionId: "other-section" };
    const world = { facultyById: new Map(), roomById: new Map(), subjectById: new Map(), sectionStudentCountById: new Map() };
    expect(detectConflicts([entry, other], world).filter((c) => c.type === "ROOM_CONFLICT")).toHaveLength(0);
    expect(detectConflicts([entry, { ...other, facultyId: entry.facultyId }], world).some((c) => c.type === "FACULTY_CONFLICT")).toBe(true);
    expect(checkEntry(entry, [], [{ id: "room", name: "Room designation", kind: "ROOM_DESIGNATION", params: {}, departmentId: null }], context())).toHaveLength(0);
  });
});
