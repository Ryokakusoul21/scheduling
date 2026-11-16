import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Scope } from "@/lib/permissions/scope";
import { autoFixture } from "./fixtures/auto-schedule";
import { DEFAULT_TIMETABLE } from "@/lib/timetable/config";

const m = vi.hoisted(() => ({ schedules: vi.fn(), sections: vi.fn(), subjects: vi.fn(), faculty: vi.fn(), rooms: vi.fn(), assignments: vi.fn(), submissions: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: {
  schedule: { findMany: m.schedules }, section: { findMany: m.sections }, subject: { findMany: m.subjects }, faculty: { findMany: m.faculty }, room: { findMany: m.rooms },
  subjectAssignment: { findMany: m.assignments }, timetableSubmission: { findMany: m.submissions },
  semester: { findMany: async () => [{ id: "t1", startDate: new Date(0), endDate: new Date(1) }] },
} }));
vi.mock("@/lib/permissions/scope", () => ({ policyUserFromScope: (s: Scope) => ({ ...s, id: s.userId }) }));
vi.mock("@/lib/scheduler/constraints-server", () => ({ activeRules: async () => [], loadContext: async () => autoFixture(1).ruleCtx }));
vi.mock("@/lib/scheduler/term-conflicts", () => ({ concurrentTermIds: async () => ["t1"] }));
vi.mock("@/lib/timetable/service", () => ({ readTimetableBundle: async () => ({ school: DEFAULT_TIMETABLE, overrides: {} }) }));
import { serverInput } from "@/lib/scheduler/resolver/server";

const scope = { userId: "head", role: "HEAD_OF_DEPARTMENT", status: "ACTIVE", archivedAt: null, departmentId: "cs", departmentIds: ["cs"], programIds: ["bsit"], isAdmin: false } as Scope;
beforeEach(() => {
  vi.resetAllMocks();
  const input = autoFixture(1);
  m.schedules.mockResolvedValue([]);
  m.sections.mockResolvedValue(input.sections.map((s) => ({ ...s, semesterId: "t1", archivedAt: null, classPlaceholders: s.curriculum })));
  m.subjects.mockResolvedValue(input.subjects.map((s) => ({ ...s, archivedAt: null })));
  m.faculty.mockResolvedValue(input.faculty.map((f) => ({ ...f, departmentId: "cs", status: "ACTIVE", archivedAt: null, roomPreferences: [], employmentType: "FULL_TIME" })));
  m.rooms.mockResolvedValue(input.rooms.map((r) => ({ ...r, departmentId: "cs", isGeneralShared: true, programs: [], archivedAt: null })));
  m.assignments.mockResolvedValue(input.assignments);
  m.submissions.mockResolvedValue([]);
});
describe("authoritative resolver input", () => {
  it("loads approved queue requirements and term-specific teachers from the same saved records", async () => {
    const input = await serverInput(scope, ["t1"]);
    expect(input.sections[0].curriculum).toEqual([{ subjectId: "cc101", component: "LECTURE", requiredMin: 180 }]);
    expect(input.assignments?.[0]).toMatchObject({ subjectId: "cc101", sectionId: "s0", semesterId: "t1", facultyId: "ana" });
    expect(input.sections[0].editable).toBe(true);
  });
  it("marks submitted departmental timetables as locked", async () => {
    m.submissions.mockResolvedValue([{ departmentId: "cs", semesterId: "t1" }]);
    expect((await serverInput(scope, ["t1"])).sections[0].editable).toBe(false);
  });
  it("marks other departments' sections read-only while keeping their meetings available for clash checks", async () => {
    m.sections.mockResolvedValue([{ ...autoFixture(1).sections[0], semesterId: "t1", departmentId: "other", archivedAt: null, classPlaceholders: [] }]);
    expect((await serverInput(scope, ["t1"])).sections[0].editable).toBe(false);
  });
  it("excludes archived subjects from schedulable components", async () => {
    m.subjects.mockResolvedValue(autoFixture(1).subjects.map((s) => ({ ...s, archivedAt: new Date() })));
    expect((await serverInput(scope, ["t1"])).sections[0].curriculum).toEqual([]);
  });
  it("allows active external faculty only after an active assignment to an authorized section", async () => {
    m.faculty.mockResolvedValue(autoFixture(1).faculty.map((f) => ({ ...f, departmentId: "gened", status: "ACTIVE", archivedAt: null, roomPreferences: [], employmentType: "FULL_TIME" })));
    expect((await serverInput(scope, ["t1"])).faculty[0].assignable).toBe(true);
    m.assignments.mockResolvedValue([]);
    expect((await serverInput(scope, ["t1"])).faculty[0].assignable).toBe(false);
  });
  it("does not grant external faculty placement authority from another department's section", async () => {
    m.faculty.mockResolvedValue(autoFixture(1).faculty.map((f) => ({ ...f, departmentId: "gened", status: "ACTIVE", archivedAt: null, roomPreferences: [], employmentType: "FULL_TIME" })));
    m.sections.mockResolvedValue([{ ...autoFixture(1).sections[0], semesterId: "t1", departmentId: "other", archivedAt: null, classPlaceholders: [] }]);
    expect((await serverInput(scope, ["t1"])).faculty[0].assignable).toBe(false);
  });
  it("keeps inactive faculty unavailable even with a saved assignment", async () => {
    m.faculty.mockResolvedValue(autoFixture(1).faculty.map((f) => ({ ...f, departmentId: "gened", status: "INACTIVE", archivedAt: null, roomPreferences: [], employmentType: "FULL_TIME" })));
    expect((await serverInput(scope, ["t1"])).faculty[0].assignable).toBe(false);
  });
});
