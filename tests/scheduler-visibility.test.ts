import { beforeEach, describe, expect, it, vi } from "vitest";
import { Children, isValidElement, type ReactNode } from "react";
import type { Scope } from "@/lib/permissions/scope";
import type { SchedulerData } from "@/components/scheduler/types";

const m = vi.hoisted(() => ({ scope: vi.fn(), schedules: vi.fn(), exams: vi.fn(), sections: vi.fn(), workload: vi.fn() }));
vi.mock("@/lib/permissions/scope", () => ({ getScope: m.scope, policyUserFromScope: (scope: Scope) => ({ ...scope, id: scope.userId }) }));
vi.mock("@/lib/db/prisma", () => ({ prisma: {
  academicYear: { findMany: async () => [{ id: "year", name: "2026–2027", isActive: true }] },
  semester: { findMany: async () => [{ id: "term", academicYearId: "year", level: "COLLEGE", type: "FIRST_SEMESTER", isActive: true, program: null, startDate: new Date("2026-06-01"), endDate: new Date("2026-12-01") }] },
  schedule: { findMany: m.schedules }, examination: { findMany: m.exams }, section: { findMany: m.sections },
  program: { findMany: async () => [] }, department: { findMany: async () => [] }, faculty: { findMany: async () => [] },
  room: { findMany: async () => [] }, subject: { findMany: async () => [] }, subjectAssignment: { findMany: async () => [] },
} }));
vi.mock("@/lib/timetable/service", () => ({ loadTimetableBundle: async () => ({ school: {}, overrides: {} }) }));
vi.mock("@/lib/scheduler/constraints-server", () => ({ activeRules: async () => [] }));
vi.mock("@/lib/workload/load", () => ({ loadWorkload: m.workload }));
vi.mock("@/lib/workload/auto", () => ({ activeTermIds: async () => ["term"] }));
vi.mock("@/lib/examinations/context", () => ({ loadExamContext: async () => ({ window: null, blockedDates: new Map() }) }));
vi.mock("@/components/scheduler/scheduler-workspace", () => ({ SchedulerWorkspace: () => null }));
vi.mock("@/components/scheduler/exam-workspace", () => ({ ExamWorkspace: () => null }));
vi.mock("@/components/scheduler/academic-year-switcher", () => ({ AcademicYearSwitcher: () => null }));
vi.mock("@/components/scheduler/mode-switch", () => ({ ModeSwitch: () => null }));
vi.mock("@/components/scheduler/head-notices", () => ({ HeadNotices: () => null }));

import SchedulerPage from "@/app/(dashboard)/scheduler/page";
import { ExamMode } from "@/app/(dashboard)/scheduler/exam-mode";

/** Evaluate the Prisma predicates used by these loaders against mixed workflow fixtures. */
function matches(row: Record<string, unknown>, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (key === "AND") return (value as Record<string, unknown>[]).every((part) => matches(row, part));
    if (key === "OR") return (value as Record<string, unknown>[]).some((part) => matches(row, part));
    if (key === "NOT") return !matches(row, value as Record<string, unknown>);
    if (value === null || typeof value !== "object") return row[key] === value;
    const filter = value as Record<string, unknown>;
    if ("in" in filter) return (filter.in as unknown[]).includes(row[key]);
    if ("not" in filter) return row[key] !== filter.not;
    if ("is" in filter) return row[key] != null && matches(row[key] as Record<string, unknown>, filter.is as Record<string, unknown>);
    return row[key] != null && matches(row[key] as Record<string, unknown>, filter);
  });
}

const scope = (role: Scope["role"]): Scope => ({ userId: "user", name: "User", role, status: "ACTIVE", archivedAt: null, facultyId: "teacher", departmentId: "cs", departmentIds: ["cs"], actingDepartmentIds: [], programIds: ["bsit"], manageDepartmentId: role === "HEAD_OF_DEPARTMENT" ? "cs" : null, isAdmin: role === "REGISTRAR" || role === "SUPER_ADMINISTRATOR" });
const meeting = (id: string, status: string, submissionStatus: string | null = null) => ({
  id, status, sectionId: id, semesterId: "term", subjectId: "subject", facultyId: "teacher", roomId: "room", component: "LECTURE", dayOfWeek: "MONDAY", startMin: 480, endMin: 540,
  semester: { academicYearId: "year", level: "COLLEGE" }, section: { departmentId: "cs", programId: "bsit" }, submission: submissionStatus ? { status: submissionStatus } : null,
  notes: id.startsWith("private") ? "PRIVATE_UNSUBMITTED_MEETING" : "", date: new Date("2026-11-16"), type: "PRELIM", proctorId: "teacher",
});
let meetings: ReturnType<typeof meeting>[];
function workspaceData(node: ReactNode): SchedulerData | undefined {
  if (!isValidElement<{ data?: SchedulerData; children?: ReactNode }>(node)) return;
  return node.props.data ?? Children.toArray(node.props.children).map(workspaceData).find(Boolean);
}

beforeEach(() => {
  vi.clearAllMocks();
  meetings = [meeting("private-draft", "DRAFT"), meeting("private-orphan-review", "REVIEW"), meeting("submitted", "REVIEW", "SUBMITTED"), meeting("approved", "REVIEW", "APPROVED"), meeting("published", "PUBLISHED", "PUBLISHED"), meeting("legacy-published", "PUBLISHED"), ...["RETURNED", "REJECTED", "WITHDRAWN"].map((state) => meeting(`private-${state}`, "DRAFT", state)), meeting("archived", "ARCHIVED", "PUBLISHED")];
  m.workload.mockResolvedValue(null);
  m.schedules.mockImplementation(async ({ where }) => meetings.filter((row) => matches(row, where)));
  m.exams.mockImplementation(async ({ where }) => meetings.filter((row) => matches(row, where)));
  m.sections.mockImplementation(async ({ where }) => meetings.map((row) => ({ id: row.id, name: row.id, departmentId: "cs", programId: "bsit", level: "COLLEGE", semesterId: "term", semester: { academicYearId: "year" }, classPlaceholders: [], studentCount: 30, archivedAt: null })).filter((row) => matches(row, where)));
});

describe("server-side timetable visibility", () => {
  it.each(["SUPER_ADMINISTRATOR", "REGISTRAR"] as const)("withholds unsubmitted class rows and sections from %s", async (role) => {
    m.scope.mockResolvedValue(scope(role));
    const data = workspaceData(await SchedulerPage({ searchParams: Promise.resolve({}) }))!;
    expect(data.entries.map((row) => row.id)).toEqual(["submitted", "approved", "published", "legacy-published"]);
    expect(data.sections.map((row) => row.id)).toEqual(["submitted", "approved", "published", "legacy-published"]);
    expect(data.busy).toEqual([]);
    expect(JSON.stringify(data)).not.toContain("private-");
    expect(JSON.stringify(data)).not.toContain("PRIVATE_UNSUBMITTED_MEETING");
    expect(m.workload).toHaveBeenCalledWith(["term"], null, { visibilityRole: role });
  });

  it.each(["SUPER_ADMINISTRATOR", "REGISTRAR"] as const)("withholds unsubmitted examinations and their class references from %s", async (role) => {
    const result = await ExamMode({ scope: scope(role), academicYearId: "year", academicYearControl: null });
    const { data } = result.props;
    expect(data.exams.map((row: { id: string }) => row.id)).toEqual(["submitted", "approved", "published", "legacy-published"]);
    expect(data.sections.map((row: { id: string }) => row.id)).toEqual(["submitted", "approved", "published", "legacy-published"]);
    expect(JSON.stringify(data)).not.toContain("PRIVATE_UNSUBMITTED_MEETING");
    expect(data.classes).toHaveLength(4);
  });

  it("exposes a draft only after submission and hides its withdrawn revision again", async () => {
    m.scope.mockResolvedValue(scope("REGISTRAR"));
    const ids = async () => workspaceData(await SchedulerPage({ searchParams: Promise.resolve({}) }))!.entries.map((row) => row.id);
    expect(await ids()).not.toContain("private-draft");
    meetings[0] = { ...meetings[0], status: "REVIEW", submission: { status: "SUBMITTED" } };
    expect(await ids()).toContain("private-draft");
    meetings[0] = { ...meetings[0], status: "DRAFT", submission: { status: "WITHDRAWN" } };
    expect(await ids()).not.toContain("private-draft");
  });

  it("keeps department drafts visible to their Head and limits faculty to published meetings", async () => {
    m.scope.mockResolvedValue(scope("HEAD_OF_DEPARTMENT"));
    const head = workspaceData(await SchedulerPage({ searchParams: Promise.resolve({}) }))!;
    expect(head.entries.map((row) => row.id)).toContain("private-draft");
    m.scope.mockResolvedValue(scope("FACULTY"));
    const faculty = workspaceData(await SchedulerPage({ searchParams: Promise.resolve({}) }))!;
    expect(faculty.entries.map((row) => row.id)).toEqual(["published", "legacy-published"]);
  });
});
