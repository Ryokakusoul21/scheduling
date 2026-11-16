import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Scope } from "@/lib/permissions/scope";

const m = vi.hoisted(() => ({ scope: vi.fn(), subjects: vi.fn(), sections: vi.fn(), term: vi.fn(), existing: vi.fn(), pending: vi.fn(), proposals: vi.fn(), managers: vi.fn(), meetings: vi.fn(), pool: vi.fn(), archive: vi.fn(), create: vi.fn(), audit: vi.fn(), transaction: vi.fn() }));
const sync = vi.hoisted(() => vi.fn());
vi.mock("@/lib/subjects/assignment-curriculum", () => ({ syncAssignedCurriculum: sync, AssignmentCurriculumError: class extends Error {} }));
vi.mock("@/lib/permissions/scope", () => ({ requireScope: m.scope, policyUserFromScope: (s: Scope) => ({ ...s, id: s.userId }) }));
vi.mock("@/lib/permissions/department", () => ({ logBlocked: vi.fn() }));
vi.mock("@/lib/notify", () => ({ notifyFacultyEach: vi.fn(), notifyManagers: m.managers }));
vi.mock("@/lib/workload/auto", () => ({ queueWorkloadCheck: vi.fn() }));
vi.mock("@/lib/subjects/assignments", () => ({ assignableFaculty: m.pool }));
vi.mock("@/lib/db/prisma", () => ({ prisma: {
  subject: { findMany: m.subjects }, section: { findMany: m.sections }, semester: { findUnique: m.term },
  subjectAssignment: { findMany: m.existing }, schedule: { findMany: m.meetings, count: async () => 0 }, $transaction: m.transaction,
} }));
import { saveAssignmentPlanAction } from "@/app/(dashboard)/subjects/assignment-actions";

const teacher = (id: string) => ({ id, name: id, email: `${id}@test`, employeeId: id, departmentId: "cs", departmentName: "Computing", specialization: null, employmentType: "FULL_TIME", load: 0, minimum: 0, limit: 24, unavailability: [] });
const scope = { userId: "head", role: "HEAD_OF_DEPARTMENT", status: "ACTIVE", archivedAt: null, departmentId: "cs", departmentIds: ["cs"], programIds: ["bsit"] };
const subject = { id: "cc101", code: "CC101", name: "Computing", level: "COLLEGE", units: 3, lectureHours: 3, labHours: 0, departmentId: "cs", programId: "bsit", yearLevel: "FIRST", gradeLevel: null, semester: "FIRST", sharedPrograms: [], department: { name: "Computing" } };
const sections = Array.from({ length: 8 }, (_, i) => ({ id: `s${i}`, name: `BSIT 1-${i}`, level: "COLLEGE", semesterId: "t1", programId: "bsit", departmentId: "cs", yearLevel: "FIRST", gradeLevel: null, classPlaceholders: [{ subjectId: "cc101" }] }));
const input = { subjectIds: ["cc101"], semesterId: "t1", changes: sections.map((s) => ({ sectionId: s.id, facultyId: "ana" })) };

beforeEach(() => {
  vi.resetAllMocks();
  sync.mockResolvedValue(0);
  m.scope.mockResolvedValue(scope);
  m.subjects.mockResolvedValue([subject]);
  m.sections.mockResolvedValue(sections);
  m.term.mockResolvedValue({ id: "t1", name: "First", level: "COLLEGE", type: "FIRST", programId: null, academicYear: { name: "2026" } });
  m.pool.mockResolvedValue({ measure: "HOURS", faculty: [teacher("ana"), teacher("ben")] });
  m.existing.mockResolvedValue([]); m.meetings.mockResolvedValue([]);
  m.pending.mockResolvedValue([]);
  m.transaction.mockImplementation(async (fn) => fn({ $executeRaw: vi.fn(), subjectAssignment: { findMany: m.existing, updateMany: m.archive, createMany: m.create }, subjectAssignmentProposal: { findMany: m.pending, createMany: m.proposals }, auditLog: { createMany: m.audit } }));
});
describe("saving section offerings", () => {
  it("saves eight explicit assignments and audits eight section-level changes", async () => {
    expect(await saveAssignmentPlanAction(input)).toMatchObject({ ok: true, changed: 8 });
    const rows = m.create.mock.calls[0][0].data;
    expect(rows).toHaveLength(8);
    expect(new Set(rows.map((row: { sectionId: string }) => row.sectionId))).toEqual(new Set(sections.map((s) => s.id)));
    expect(rows.every((row: { sectionId: string }) => !!row.sectionId)).toBe(true);
    expect(m.audit.mock.calls[0][0].data).toHaveLength(8);
    expect(sync.mock.calls[0][1]).toEqual(sections.map((s) => ({ sectionId: s.id, subjectId: "cc101", semesterId: "t1" })));
  });
  it("warns from the full section-multiplied load on the server", async () => {
    m.pool.mockResolvedValue({ measure: "HOURS", faculty: [{ ...teacher("ana"), load: 3 }, teacher("ben")] });
    expect(await saveAssignmentPlanAction(input)).toMatchObject({ ok: true, warnings: [expect.stringContaining("3 to 27 hours")] });
  });
  it("does not add warnings for duplicate unchanged assignments", async () => {
    m.existing.mockResolvedValue(sections.map((s) => ({ id: `a-${s.id}`, sectionId: s.id, subjectId: "cc101", facultyId: "ana", faculty: { fullName: "ana" } })));
    expect(await saveAssignmentPlanAction(input)).toMatchObject({ ok: true, changed: 0, warnings: [] });
    expect(sync).toHaveBeenCalledTimes(1);
    expect(m.create).not.toHaveBeenCalled();
  });
  it("changes one section without removing assignments for other sections", async () => {
    m.sections.mockResolvedValue([sections[0]]);
    m.existing.mockResolvedValue(sections.map((s) => ({ id: `a-${s.id}`, sectionId: s.id, subjectId: "cc101", facultyId: "ana", faculty: { fullName: "ana" } })));
    expect(await saveAssignmentPlanAction({ ...input, changes: [{ sectionId: "s0", facultyId: "ben" }] })).toMatchObject({ ok: true, changed: 1 });
    expect(m.archive.mock.calls[0][0].where.id.in).toEqual(["a-s0"]);
    expect(m.create.mock.calls[0][0].data).toHaveLength(1);
  });
  it.each([{ departmentId: "other" }, { programId: "other" }, { yearLevel: "SECOND" }, { semesterId: "other" }])("rejects mismatched or unauthorized sections: %o", async (patch) => {
    m.sections.mockResolvedValue(sections.map((s, i) => i ? s : { ...s, ...patch }));
    expect(await saveAssignmentPlanAction(input)).toMatchObject({ ok: false });
    expect(m.transaction).not.toHaveBeenCalled();
  });
  it("rejects all-sections defaults at the action boundary", async () => {
    expect(await saveAssignmentPlanAction({ ...input, changes: [{ sectionId: "", facultyId: "ana" }] })).toMatchObject({ ok: false });
    expect(m.transaction).not.toHaveBeenCalled();
  });
  it("lets a head assign a shared GE subject to own faculty despite a partial queue", async () => {
    m.subjects.mockResolvedValue([{ ...subject, code: "GE2", departmentId: null, programId: null, sharedPrograms: [{ id: "bsit" }] }]);
    m.sections.mockResolvedValue(sections.map((s) => ({ ...s, classPlaceholders: [{ subjectId: "other" }] })));
    expect(await saveAssignmentPlanAction(input)).toMatchObject({ ok: true, assigned: 8, proposed: 0 });
    expect(m.proposals).not.toHaveBeenCalled();
    expect(sync).toHaveBeenCalled();
  });
  it("saves own faculty directly and submits external faculty for approval in one transaction", async () => {
    m.pool.mockResolvedValue({ measure: "HOURS", faculty: [teacher("ana"), { ...teacher("ben"), departmentId: "gened" }] });
    m.sections.mockResolvedValue(sections.slice(0, 2));
    expect(await saveAssignmentPlanAction({ ...input, changes: [{ sectionId: "s0", facultyId: "ana" }, { sectionId: "s1", facultyId: "ben" }] })).toMatchObject({ ok: true, assigned: 1, proposed: 1 });
    expect(m.transaction).toHaveBeenCalledTimes(1);
    expect(m.create.mock.calls[0][0].data).toEqual([expect.objectContaining({ sectionId: "s0", facultyId: "ana" })]);
    expect(m.proposals.mock.calls[0][0].data).toEqual([expect.objectContaining({ sectionId: "s1", facultyId: "ben", reviewDepartmentId: "gened" })]);
    expect(sync.mock.calls[0][1]).toEqual([{ subjectId: "cc101", sectionId: "s0", semesterId: "t1" }]);
    expect(m.managers).toHaveBeenCalledWith("gened", expect.anything());
  });
  it("does not replace an active teacher while an external proposal is pending", async () => {
    m.pending.mockResolvedValue([{ subjectId: "cc101", sectionId: "s0" }]);
    expect(await saveAssignmentPlanAction(input)).toMatchObject({ ok: false, error: expect.stringContaining("pending proposal") });
    expect(m.archive).not.toHaveBeenCalled(); expect(m.create).not.toHaveBeenCalled();
  });
  it("rejects an inactive or unknown teacher before saving", async () => {
    m.sections.mockResolvedValue(sections.slice(0, 1));
    expect(await saveAssignmentPlanAction({ ...input, changes: [{ sectionId: "s0", facultyId: "inactive-temp" }] })).toMatchObject({ ok: false, error: expect.stringContaining("not active") });
    expect(m.transaction).not.toHaveBeenCalled();
  });
  it("detects assignment changes made after the review data was loaded", async () => {
    m.existing.mockResolvedValueOnce([]).mockResolvedValue([{ id: "concurrent", subjectId: "cc101", sectionId: "s0", facultyId: "ben" }]);
    expect(await saveAssignmentPlanAction(input)).toMatchObject({ ok: false, error: expect.stringContaining("changed while") });
    expect(m.create).not.toHaveBeenCalled();
  });
  it("allows the Registrar to assign external faculty directly", async () => {
    m.scope.mockResolvedValue({ ...scope, role: "REGISTRAR" });
    m.pool.mockResolvedValue({ measure: "HOURS", faculty: [{ ...teacher("ana"), departmentId: "gened" }] });
    expect(await saveAssignmentPlanAction(input)).toMatchObject({ ok: true, assigned: 8, proposed: 0 });
    expect(m.proposals).not.toHaveBeenCalled();
  });
});
