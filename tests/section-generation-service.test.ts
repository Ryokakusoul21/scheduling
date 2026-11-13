import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Scope } from "@/lib/permissions/scope";

const mocks = vi.hoisted(() => ({ program: vi.fn(), term: vi.fn(), sections: vi.fn(), collision: vi.fn(), subjects: vi.fn(),
  update: vi.fn(), create: vi.fn(), placeholders: vi.fn(), audit: vi.fn(), auditFind: vi.fn(), remove: vi.fn(), transaction: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/permissions/scope", () => ({ policyUserFromScope: (s: Record<string, unknown>) => ({ ...s, id: s.userId }) }));
vi.mock("@/lib/db/prisma", () => ({ prisma: {
  program: { findUnique: mocks.program }, semester: { findUnique: mocks.term }, section: { findMany: mocks.sections, findFirst: mocks.collision },
  subject: { findMany: mocks.subjects }, $transaction: mocks.transaction,
} }));
import { generateSectionBatch, sectionGenerationContext, undoSectionBatch } from "@/lib/sections/generation-service";

const scope = { userId: "head", role: "HEAD_OF_DEPARTMENT", status: "ACTIVE", archivedAt: null, departmentIds: ["cs"], programIds: ["bsit"] } as Scope;
const keys = { programId: "bsit", yearLevel: "FIRST", semesterId: "term" };
const time = new Date("2026-11-13T03:00:00.000Z");
const deps = { schedules: 0, students: 0, examinations: 0, subjectAssignments: 0 };
const row = (id: string, name: string, studentCount = 30) => ({ id, name, studentCount, departmentId: "cs", programId: "bsit", updatedAt: time, archivedAt: null, sortOrder: id === "a" ? 0 : 1, generationBatchId: null, _count: { ...deps } });
const settings = { ...keys, totalLearners: 106, maximum: 40, balanced: true, mode: "ADD", pattern: "CODE", linkCurriculum: true };

async function input() {
  const preview = await sectionGenerationContext(scope, keys);
  if (!preview.ok) throw new Error(preview.error);
  return { ...settings, fingerprint: preview.context.fingerprint };
}

describe("section generation transactions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.program.mockResolvedValue({ id: "bsit", code: "BSIT", name: "Information Technology", departmentId: "cs", level: "COLLEGE" });
    mocks.term.mockResolvedValue({ id: "term", type: "FIRST", level: "COLLEGE", programId: "bsit" });
    mocks.sections.mockResolvedValue([row("a", "BSIT 1-A"), row("b", "BSIT 1-B")]);
    mocks.subjects.mockResolvedValue([{ id: "subject", lectureHours: 3, labHours: 1 }]);
    mocks.collision.mockResolvedValue(null); mocks.auditFind.mockResolvedValue(null);
    mocks.transaction.mockImplementation(async (fn) => fn({
      program: { findUnique: mocks.program }, semester: { findUnique: mocks.term }, subject: { findMany: mocks.subjects },
      section: { findMany: mocks.sections, findFirst: mocks.collision, update: mocks.update, createMany: mocks.create, deleteMany: mocks.remove },
      sectionClassPlaceholder: { createMany: mocks.placeholders }, auditLog: { create: mocks.audit, findFirst: mocks.auditFind },
    }));
  });

  it("creates C and D at 23 students each, links only their curriculum and never updates existing sections", async () => {
    const result = await generateSectionBatch(scope, await input());
    expect(result).toMatchObject({ ok: true, created: 2, updated: 0, total: 106 });
    expect(mocks.create.mock.calls[0][0].data.map((r: { name: string; studentCount: number }) => [r.name, r.studentCount])).toEqual([["BSIT 1-C", 23], ["BSIT 1-D", 23]]);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.placeholders.mock.calls[0][0].data).toHaveLength(4);
    expect(mocks.transaction.mock.calls[0][1]).toMatchObject({ isolationLevel: "Serializable" });
    expect(mocks.audit.mock.calls[0][0].data).toMatchObject({ role: "HEAD_OF_DEPARTMENT", departmentId: "cs", entity: "SectionGeneration" });
  });

  it("recomputes from current data and rejects a stale preview without any writes", async () => {
    const data = await input();
    mocks.sections.mockResolvedValue([row("a", "BSIT 1-A", 35), row("b", "BSIT 1-B")]);
    expect(await generateSectionBatch(scope, data)).toMatchObject({ ok: false, error: expect.stringContaining("Refresh the preview") });
    expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled();
  });

  it("includes archived suffixes in the preview and refuses a global term-name collision", async () => {
    mocks.sections.mockResolvedValue([row("a", "BSIT 1-A"), row("b", "BSIT 1-B"), { ...row("old", "BSIT 1-Z"), archivedAt: time }]);
    const preview = await sectionGenerationContext(scope, keys);
    expect(preview).toMatchObject({ ok: true, context: { existing: [{ id: "a" }, { id: "b" }], reservedNames: ["BSIT 1-A", "BSIT 1-B", "BSIT 1-Z"] } });
    const result = await generateSectionBatch(scope, await input());
    expect(result.ok).toBe(true);
    expect(mocks.create.mock.calls[0][0].data[0].name).toBe("BSIT 1-AA");
    mocks.collision.mockResolvedValueOnce({ id: "other-program-name" });
    expect(await generateSectionBatch(scope, await input())).toMatchObject({ ok: false, error: expect.stringContaining("already in use") });
  });

  it("blocks foreign departments and program restrictions before reading section data", async () => {
    expect(await sectionGenerationContext({ ...scope, departmentIds: ["other"] }, keys)).toMatchObject({ ok: false });
    expect(await sectionGenerationContext({ ...scope, programIds: ["other-program"] }, keys)).toMatchObject({ ok: false });
    expect(mocks.sections).not.toHaveBeenCalled();
  });

  it("refuses a non-college program even when a generic college term is supplied", async () => {
    mocks.program.mockResolvedValue({ id: "bsit", code: "STEM", name: "STEM", departmentId: "cs", level: "SENIOR_HIGH" });
    mocks.term.mockResolvedValue({ id: "term", type: "FIRST", level: "COLLEGE", programId: null });
    expect(await sectionGenerationContext(scope, keys)).toMatchObject({ ok: false, error: expect.stringContaining("college program") });
    expect(mocks.sections).not.toHaveBeenCalled();
  });

  it("updates planning counts without touching enrolled student records and snapshots the old counts for undo", async () => {
    const result = await generateSectionBatch(scope, { ...await input(), mode: "REBALANCE" });
    expect(result).toMatchObject({ ok: true, created: 1, updated: 2 });
    expect(mocks.update.mock.calls.map(([args]) => args.data.studentCount)).toEqual([36, 35]);
    expect(mocks.audit.mock.calls[0][0].data.newValue.updated).toEqual([
      expect.objectContaining({ id: "a", before: 30, after: 36 }), expect.objectContaining({ id: "b", before: 30, after: 35 }),
    ]);
  });

  it("does not reduce counts below enrolled students", async () => {
    mocks.sections.mockResolvedValue([{ ...row("a", "BSIT 1-A", 40), _count: { ...deps, students: 40 } }, row("b", "BSIT 1-B")]);
    expect(await generateSectionBatch(scope, { ...await input(), mode: "REBALANCE" })).toMatchObject({ ok: false, error: expect.stringContaining("40 enrolled students") });
    expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled();
  });

  it("allows rebalancing without creating new sections", async () => {
    const result = await generateSectionBatch(scope, { ...await input(), mode: "REBALANCE", totalLearners: 70 });
    expect(result).toMatchObject({ ok: true, created: 0, updated: 2, total: 70 });
    expect(mocks.create).not.toHaveBeenCalled();
  });
});

describe("undo section generation", () => {
  const snapshot = { version: 1, programId: "bsit", created: [{ id: "new", name: "BSIT 1-C", studentCount: 35, updatedAt: time.toISOString() }],
    updated: [{ id: "a", before: 30, after: 36, updatedAt: time.toISOString(), dependencies: deps }],
  };
  beforeEach(() => {
    mocks.auditFind.mockReset(); mocks.audit.mockReset(); mocks.update.mockReset(); mocks.remove.mockReset();
    mocks.auditFind.mockResolvedValueOnce({ newValue: snapshot, departmentId: "cs" }).mockResolvedValue(null);
    mocks.sections.mockResolvedValue([{ ...row("new", "BSIT 1-C", 35), generationBatchId: "batch" }, row("a", "BSIT 1-A", 36)]);
    mocks.transaction.mockImplementation(async (fn) => fn({ section: { findMany: mocks.sections, update: mocks.update, deleteMany: mocks.remove }, auditLog: { findFirst: mocks.auditFind, create: mocks.audit } }));
  });

  it("restores previous counts and removes only this batch's unused sections atomically", async () => {
    expect(await undoSectionBatch(scope, "batch")).toEqual({ ok: true });
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: "a" }, data: { studentCount: 30 } });
    expect(mocks.remove).toHaveBeenCalledWith({ where: { id: { in: ["new"] }, generationBatchId: "batch" } });
  });

  it.each(["students", "schedules", "examinations", "subjectAssignments"])("refuses removal after new sections gain %s", async (dependency) => {
    mocks.sections.mockResolvedValue([{ ...row("new", "BSIT 1-C", 35), generationBatchId: "batch", _count: { ...deps, [dependency]: 1 } }, row("a", "BSIT 1-A", 36)]);
    expect(await undoSectionBatch(scope, "batch")).toMatchObject({ ok: false });
    expect(mocks.remove).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled();
  });

  it("refuses edited sections, duplicate undo and another department", async () => {
    mocks.sections.mockResolvedValue([{ ...row("new", "BSIT 1-C", 35), generationBatchId: "batch" }, row("a", "BSIT 1-A", 40)]);
    expect(await undoSectionBatch(scope, "batch")).toMatchObject({ ok: false });
    mocks.auditFind.mockReset().mockResolvedValue({ newValue: snapshot, departmentId: "cs" });
    expect(await undoSectionBatch(scope, "batch")).toMatchObject({ ok: false, error: expect.stringContaining("already undone") });
    expect(await undoSectionBatch({ ...scope, departmentIds: ["foreign"] }, "batch")).toMatchObject({ ok: false });
  });
});
