import { beforeEach, describe, it, expect, vi } from "vitest";
import type { Scope } from "@/lib/permissions/scope";
import { DEFAULT_TIMETABLE } from "@/lib/timetable/config";

const m = vi.hoisted(() => ({ settings: vi.fn(), department: vi.fn(), term: vi.fn(), classes: vi.fn(), exams: vi.fn(), upsert: vi.fn(), remove: vi.fn(), audit: vi.fn(), transaction: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: { systemSetting: { findMany: m.settings }, department: { findUnique: m.department }, semester: { findUnique: m.term }, schedule: { findMany: m.classes }, examination: { findMany: m.exams }, $transaction: m.transaction } }));
import { loadTimetableEditor, previewTimetableChange, saveTimetableChange } from "@/lib/timetable/service";
const scope = { userId: "head", role: "HEAD_OF_DEPARTMENT", status: "ACTIVE", archivedAt: null, departmentIds: ["cs"], programIds: ["it"] } as Scope;
const choice = { departmentId: "cs", termId: "term" };
const input = { ...choice, config: { ...DEFAULT_TIMETABLE, dayStart: 480 }, inherit: false };
const date = new Date("2026-11-13T00:00:00Z");
describe("timetable configuration service", () => {
  beforeEach(() => {
    vi.resetAllMocks(); m.settings.mockResolvedValue([]); m.department.mockResolvedValue({ id: "cs" });
    m.term.mockResolvedValue({ programId: "it", program: { departmentId: "cs" } });
    m.classes.mockResolvedValue([{ id: "class", semesterId: "term", dayOfWeek: "MONDAY", startMin: 420, endMin: 480, updatedAt: date, section: { name: "1A", departmentId: "cs" } }]);
    m.exams.mockResolvedValue([{ id: "exam", semesterId: "term", date: new Date("2026-11-16T00:00:00Z"), startMin: 420, endMin: 480, updatedAt: date, section: { name: "1A", departmentId: "cs" } }]);
    // There are deliberately no schedule/examination write methods in the transaction.
    m.transaction.mockImplementation(async (fn) => fn({ systemSetting: { findMany: m.settings, upsert: m.upsert, deleteMany: m.remove }, department: { findUnique: m.department }, semester: { findUnique: m.term }, schedule: { findMany: m.classes }, examination: { findMany: m.exams }, auditLog: { create: m.audit } }));
  });
  it("loads inherited configuration and previews classes and examinations before writing settings only", async () => {
    expect(await loadTimetableEditor(scope, choice)).toMatchObject({ ok: true, inherited: true, canInherit: true });
    const preview = await previewTimetableChange(scope, input);
    expect(preview).toMatchObject({ ok: true, affected: 2, checked: 2 });
    expect(m.upsert).not.toHaveBeenCalled();
    if (!preview.ok) throw Error(preview.error);
    expect(await saveTimetableChange(scope, { ...input, token: preview.token })).toEqual({ ok: true });
    expect(m.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { key: "timetable:term:cs" }, update: { value: input.config } }));
    expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ entity: "TimetableConfiguration", departmentId: "cs" }) }));
    expect(m.transaction.mock.calls[0][1]).toMatchObject({ isolationLevel: "Serializable" });
  });
  it("saves a department block preference without changing existing class or exam times", async () => {
    const change = { ...input, config: { ...DEFAULT_TIMETABLE, classSession: "BLOCK_180" } };
    const preview = await previewTimetableChange(scope, change);
    expect(preview).toMatchObject({ ok: true, affected: 0, checked: 2 });
    if (!preview.ok) throw Error(preview.error);
    expect(await saveTimetableChange(scope, { ...change, token: preview.token })).toEqual({ ok: true });
    expect(m.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: { value: change.config } }));
  });

  it("rejects stale configuration or changed class times without writing", async () => {
    const preview = await previewTimetableChange(scope, input); if (!preview.ok) throw Error(preview.error);
    m.classes.mockResolvedValue([]);
    expect(await saveTimetableChange(scope, { ...input, token: preview.token })).toMatchObject({ ok: false, error: expect.stringContaining("Preview the changes again") });
    expect(m.upsert).not.toHaveBeenCalled(); expect(m.audit).not.toHaveBeenCalled();
  });
  it("blocks foreign departments, school defaults, foreign programs and inactive users", async () => {
    for (const [actor, selection] of [[scope, { ...choice, departmentId: "other" }], [scope, { departmentId: null, termId: null }], [{ ...scope, programIds: ["other"] }, choice], [{ ...scope, status: "INACTIVE" }, choice]] as const) {
      expect(await loadTimetableEditor(actor as Scope, selection)).toMatchObject({ ok: false });
    }
    expect(m.settings).not.toHaveBeenCalled();
  });
  it("refuses department hours beyond the school envelope and requires preview", async () => {
    expect(await previewTimetableChange(scope, { ...input, config: { ...DEFAULT_TIMETABLE, dayStart: 360 } })).toMatchObject({ ok: false, error: expect.stringContaining("school") });
    expect(await saveTimetableChange(scope, input)).toMatchObject({ ok: false });
    expect(m.upsert).not.toHaveBeenCalled();
  });
  it("allows the Registrar to manage defaults and to remove term overrides by inheritance", async () => {
    const registrar = { ...scope, role: "REGISTRAR", departmentIds: [], programIds: [] } as Scope;
    const change = { ...input, departmentId: null, termId: null };
    const preview = await previewTimetableChange(registrar, change); if (!preview.ok) throw Error(preview.error);
    expect(await saveTimetableChange(registrar, { ...change, token: preview.token })).toEqual({ ok: true });
    const inherit = { ...input, inherit: true };
    const second = await previewTimetableChange(scope, inherit); if (!second.ok) throw Error(second.error);
    expect(await saveTimetableChange(scope, { ...inherit, token: second.token })).toEqual({ ok: true });
    expect(m.remove).toHaveBeenCalledWith({ where: { key: "timetable:term:cs" } });
  });
});
