import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Scope } from "@/lib/permissions/scope";
import { sectionNeeds } from "@/lib/scheduler/summary";

const mocks = vi.hoisted(() => ({
  section: vi.fn(), subjects: vi.fn(), placeholders: vi.fn(), transaction: vi.fn(),
  create: vi.fn(), aggregate: vi.fn(), duplicate: vi.fn(), scope: vi.fn(),
}));
vi.mock("@/lib/permissions/scope", () => ({
  requireScope: mocks.scope,
  policyUserFromScope: (s: Scope) => ({ ...s, id: s.userId }),
  OUTSIDE_DEPARTMENT: "Outside your department",
}));
vi.mock("@/lib/permissions/department", () => ({ recordDepartment: async () => "cs", logBlocked: vi.fn() }));
vi.mock("@/lib/workload/auto", () => ({ queueWorkloadCheck: vi.fn() }));
vi.mock("@/lib/sections/generation-service", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: {
  section: { findUnique: mocks.section, findFirst: mocks.duplicate },
  $transaction: mocks.transaction,
} }));

import { CurriculumError, linkEmptySectionCurriculum } from "@/lib/sections/curriculum-service";
import { loadSectionCurriculumAction, saveSectionAction } from "@/app/(dashboard)/sections/actions";

const scope = { userId: "head", role: "HEAD_OF_DEPARTMENT", status: "ACTIVE", archivedAt: null, departmentIds: ["cs"], programIds: ["bsit"] } as Scope;
const section = {
  id: "s1", level: "COLLEGE", programId: "bsit", departmentId: "cs", yearLevel: "FIRST", gradeLevel: null,
  semesterId: "t1", semester: { type: "FIRST", level: "COLLEGE", programId: "bsit" },
  archivedAt: null, _count: { classPlaceholders: 0 },
};
const subject = { id: "it101", level: "COLLEGE", programId: "bsit", yearLevel: "FIRST", gradeLevel: null, lectureHours: 2, labHours: 3 };
const db = {
  section: { findUnique: mocks.section, create: mocks.create, aggregate: mocks.aggregate },
  subject: { findMany: mocks.subjects }, sectionClassPlaceholder: { createMany: mocks.placeholders },
} as unknown as Parameters<typeof linkEmptySectionCurriculum>[0];
const form = () => {
  const data = new FormData();
  Object.entries({ name: "BSIT 1A", studentCount: "40", level: "COLLEGE", programId: "bsit", yearLevel: "FIRST", semesterId: "t1" }).forEach(([key, value]) => data.set(key, value));
  return data;
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.scope.mockResolvedValue(scope);
  mocks.section.mockResolvedValue(section);
  mocks.subjects.mockResolvedValue([subject]);
  mocks.placeholders.mockImplementation(async ({ data }) => ({ count: data.length }));
  mocks.transaction.mockImplementation(async (fn) => fn(db));
  mocks.create.mockResolvedValue(section);
  mocks.aggregate.mockResolvedValue({ _max: { sortOrder: 0 } });
  mocks.duplicate.mockResolvedValue(null);
});

describe("section curriculum setup", () => {
  it("creates a manual section and its schedulable lecture/lab queue in the same transaction", async () => {
    expect(await saveSectionAction(null, form())).toEqual({ ok: true });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    const curriculum = mocks.placeholders.mock.calls[0][0].data;
    expect(curriculum).toEqual([
      { sectionId: "s1", subjectId: "it101", component: "LECTURE" },
      { sectionId: "s1", subjectId: "it101", component: "LABORATORY" },
    ]);
    expect(sectionNeeds({ ...section, curriculum }, [subject], [], "t1")).toHaveLength(2);
  });

  it("repairs an existing empty section through the server action", async () => {
    expect(await loadSectionCurriculumAction("s1")).toEqual({ ok: true, created: 2 });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("preserves existing approved curriculum and remembered assignments on repeated loads", async () => {
    mocks.section.mockResolvedValue({ ...section, _count: { classPlaceholders: 1 } });
    expect(await loadSectionCurriculumAction("s1")).toEqual({ ok: true, created: 0 });
    expect(mocks.subjects).not.toHaveBeenCalled();
    expect(mocks.placeholders).not.toHaveBeenCalled();
  });

  it.each([
    { departmentId: "foreign" }, { programId: "restricted" }, { archivedAt: new Date() },
  ])("refuses curriculum changes outside editable scope: %o", async (patch) => {
    mocks.section.mockResolvedValue({ ...section, ...patch });
    expect(await loadSectionCurriculumAction("s1")).toMatchObject({ ok: false });
    expect(mocks.subjects).not.toHaveBeenCalled();
    expect(mocks.placeholders).not.toHaveBeenCalled();
  });

  it.each([null, { type: "FIRST", level: "SENIOR_HIGH", programId: null }, { type: "FIRST", level: "COLLEGE", programId: "other" }])("rejects missing or incompatible terms: %o", async (semester) => {
    mocks.section.mockResolvedValue({ ...section, semester });
    await expect(linkEmptySectionCurriculum(db, scope, "s1")).rejects.toBeInstanceOf(CurriculumError);
    expect(mocks.placeholders).not.toHaveBeenCalled();
  });

  it("requires an academic term when manually creating college sections", async () => {
    const data = form(); data.delete("semesterId");
    expect(await saveSectionAction(null, data)).toMatchObject({ ok: false, error: expect.stringContaining("academic term") });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("limits subjects to active matching curriculum, including explicit sharing and any-year/any-term subjects", async () => {
    await linkEmptySectionCurriculum(db, scope, "s1");
    expect(mocks.subjects).toHaveBeenCalledWith(expect.objectContaining({ where: {
      archivedAt: null, level: "COLLEGE", AND: [
        { OR: [{ programId: "bsit" }, { sharedPrograms: { some: { id: "bsit" } } }, { programId: null, sharedPrograms: { none: {} } }] },
        { OR: [{ yearLevel: "FIRST" }, { yearLevel: null }] },
        { OR: [{ semester: "FIRST" }, { semester: null }] },
      ],
    } }));
  });

  it("does not create placeholders for subjects without weekly hours", async () => {
    mocks.subjects.mockResolvedValue([{ ...subject, lectureHours: 0, labHours: 0 }]);
    expect(await loadSectionCurriculumAction("s1")).toEqual({ ok: true, created: 0 });
    expect(mocks.placeholders).not.toHaveBeenCalled();
  });
});
