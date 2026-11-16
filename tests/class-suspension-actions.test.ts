import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  $transaction: vi.fn(), $executeRaw: vi.fn(),
  section: { findMany: vi.fn() },
  schedule: { findMany: vi.fn(), count: vi.fn() },
  student: { findMany: vi.fn() },
  classSuspension: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  activity: { create: vi.fn(), deleteMany: vi.fn() },
  auditLog: { create: vi.fn() },
}));
const scopeRef = vi.hoisted(() => ({ scope: null as unknown }));

vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("@/lib/workload/auto", () => ({ queueWorkloadCheck: vi.fn() }));
vi.mock("@/lib/permissions/scope", async () => ({
  requireScope: async () => scopeRef.scope,
  policyUserFromScope: (s: Record<string, unknown>) => ({ id: s.userId, role: s.role, status: s.status ?? "ACTIVE", departmentIds: s.departmentIds, programIds: s.programIds ?? [] }),
}));
vi.mock("@/lib/occupancy/adjust", () => ({
  planSuspension: vi.fn(), writePlan: vi.fn(), notifyPlan: vi.fn(),
  undoBatch: vi.fn(async () => null),
}));
vi.mock("@/lib/notify", () => ({ notifyUsers: vi.fn() }));

import { applySuspensionAction as applyAction, liftSuspensionAction, previewSuspensionAction, type SuspensionRequest } from "@/app/(dashboard)/suspensions/actions";
import { notifyPlan, planSuspension, writePlan, undoBatch } from "@/lib/occupancy/adjust";
import { notifyUsers } from "@/lib/notify";

const hod = { userId: "hod", role: "HEAD_OF_DEPARTMENT", departmentIds: ["computer"] };
const registrar = { userId: "reg", role: "REGISTRAR", departmentIds: [] };
const req = (over: Partial<SuspensionRequest> = {}): SuspensionRequest => ({
  title: "Typhoon", reason: "Storm signal", start: "2026-11-16", end: "2026-11-16", startMin: null, endMin: null, programIds: ["p1"], level: null, ...over,
});
const section = (id: string, departmentId: string, level = "COLLEGE") => ({ id, level, departmentId, programId: "p1" });
const planned = () => ({ items: [{ scheduleId: "class1", label: "IT101 A", departmentId: "computer", kind: "CANCELLED" as const, reason: "Suspended", after: null, before: { date: "2026-11-16", roomId: "r1", roomName: "Room 1", facultyId: "f1", facultyName: "Teacher", startMin: 480, endMin: 540 } }], blockers: [], notes: [] });
async function applySuspensionAction(input: SuspensionRequest) {
  const preview = await previewSuspensionAction(input);
  return preview.ok ? applyAction(input, preview.data.fingerprint) : preview;
}

beforeEach(() => {
  vi.resetAllMocks();
  scopeRef.scope = hod;
  db.$transaction.mockImplementation(async (work) => work(db));
  db.section.findMany.mockResolvedValue([section("s1", "computer")]);
  db.schedule.count.mockResolvedValue(1);
  db.schedule.findMany.mockResolvedValue([{ sectionId: "s1" }]);
  db.student.findMany.mockResolvedValue([{ userId: "student1" }]);
  db.classSuspension.create.mockResolvedValue({ id: "sus-1" });
  vi.mocked(planSuspension).mockResolvedValue(planned());
  vi.mocked(writePlan).mockResolvedValue("batch-1");
  vi.mocked(undoBatch).mockResolvedValue(null);
});

describe("class suspension actions", () => {
  it("lets a Head of Department suspend own sections immediately and logs it", async () => {
    scopeRef.scope = hod;
    db.section.findMany.mockResolvedValue([section("s1", "computer")]);
    const r = await applySuspensionAction(req());
    expect(r.ok).toBe(true);
    expect(db.classSuspension.create.mock.calls[0][0].data).toMatchObject({ issuedRole: "HEAD_OF_DEPARTMENT", departmentId: "computer", level: "COLLEGE" });
    expect(db.auditLog.create.mock.calls[0][0].data.action).toContain("Head of Department");
  });

  it("rejects a Head of Department suspending another department", async () => {
    scopeRef.scope = hod;
    db.section.findMany.mockResolvedValue([section("s1", "business")]);
    const r = await previewSuspensionAction(req());
    expect(r).toEqual({ ok: false, error: "You can only suspend classes of sections in your department." });
  });

  it("rejects a Head of Department suspending a whole level", async () => {
    scopeRef.scope = hod;
    db.section.findMany.mockResolvedValue([]);
    const r = await previewSuspensionAction(req({ programIds: [], level: "COLLEGE" }));
    expect(r.ok).toBe(false);
  });

  it("rejects mixed academic levels in one order", async () => {
    scopeRef.scope = registrar;
    db.section.findMany.mockResolvedValue([section("s1", "computer"), { ...section("s2", "computer", "ELEMENTARY"), programId: "p2" }]);
    const r = await previewSuspensionAction(req({ programIds: ["p1", "p2"] }));
    expect(r).toEqual({ ok: false, error: "Suspend one academic level at a time." });
  });

  it("lets the Registrar suspend a whole level", async () => {
    scopeRef.scope = registrar;
    db.section.findMany.mockResolvedValue([section("s1", "computer"), section("s2", "business")]);
    const r = await applySuspensionAction(req({ programIds: [], level: "COLLEGE" }));
    expect(r.ok).toBe(true);
    expect(db.classSuspension.create.mock.calls[0][0].data).toMatchObject({ issuedRole: "REGISTRAR", departmentId: null, level: "COLLEGE" });
  });

  it("limits lifting to the owning department or the Registrar", async () => {
    db.classSuspension.findUnique.mockResolvedValue({ id: "sus-1", status: "ACTIVE", sectionIds: ["s1"], departmentId: "business", batchId: "batch-1", title: "Typhoon", batch: { adjustments: [{ kind: "CANCELLED", scheduleId: "class1" }] } });
    db.section.findMany.mockResolvedValue([section("s1", "business")]);
    scopeRef.scope = hod;
    expect((await liftSuspensionAction("sus-1")).ok).toBe(false);
    scopeRef.scope = registrar;
    expect((await liftSuspensionAction("sus-1")).ok).toBe(true);
    expect(db.classSuspension.update.mock.calls[0][0].data).toMatchObject({ status: "LIFTED", liftedById: "reg" });
  });

  it("moves virtual classes online, saves an approved continuation event, and notifies students after the order exists", async () => {
    const result = await applySuspensionAction(req({ mode: "VIRTUAL", meetingLink: "https://meet.example.com/class", instructions: "Open the class portal." }));
    expect(result.ok).toBe(true);
    expect(vi.mocked(writePlan).mock.calls[0][1].items[0]).toMatchObject({ kind: "ONLINE", after: { roomId: "", startMin: 480, endMin: 540, facultyId: "f1" } });
    expect(db.activity.create).toHaveBeenCalledWith({ data: expect.objectContaining({ type: "SCHOOL_EVENT", status: "APPROVED", location: "https://meet.example.com/class" }) });
    expect(notifyUsers).toHaveBeenCalledWith(["student1"], expect.objectContaining({ title: "Your class will meet virtually", link: "/student/schedule" }));
    expect(vi.mocked(notifyPlan).mock.invocationCallOrder[0]).toBeGreaterThan(db.auditLog.create.mock.invocationCallOrder[0]);
  });

  it("supports individual published classes while applying department and program filters", async () => {
    scopeRef.scope = { ...hod, programIds: ["p1"] };
    db.schedule.findMany.mockResolvedValue([{ id: "class1", section: section("s1", "computer") }]);
    expect((await previewSuspensionAction(req({ programIds: [], scheduleIds: ["class1"], mode: "VIRTUAL" }))).ok).toBe(true);
    expect(db.schedule.findMany.mock.calls[0][0].where.AND[0]).toEqual({ section: { departmentId: { in: ["computer"] }, programId: { in: ["p1"] } } });
    expect(planSuspension).toHaveBeenCalledWith(["s1"], expect.anything(), ["class1"]);
  });

  it("supports sections without programs", async () => {
    db.section.findMany.mockResolvedValue([{ ...section("s1", "computer", "ELEMENTARY"), programId: null }]);
    expect((await previewSuspensionAction(req({ programIds: [], sectionIds: ["s1"], level: "ELEMENTARY" }))).ok).toBe(true);
  });

  it("rejects unknown targets, foreign assigned programs, and mixed target types", async () => {
    expect((await previewSuspensionAction(req({ sectionIds: ["s1"] }))).ok).toBe(false);
    expect((await previewSuspensionAction(req({ programIds: ["unknown"] }))).ok).toBe(false);
    scopeRef.scope = { ...hod, programIds: ["p2"] };
    expect((await previewSuspensionAction(req())).ok).toBe(false);
    expect(writePlan).not.toHaveBeenCalled();
  });

  it("does not apply an unpreviewed or stale impact", async () => {
    expect((await applyAction(req())).ok).toBe(false);
    const preview = await previewSuspensionAction(req());
    if (!preview.ok) throw new Error("Expected preview");
    const changed = planned(); changed.items[0].before.startMin = 490;
    vi.mocked(planSuspension).mockResolvedValue(changed);
    expect(await applyAction(req(), preview.data.fingerprint)).toMatchObject({ ok: false, error: expect.stringContaining("changed since your preview") });
    expect(writePlan).not.toHaveBeenCalled();
  });

  it("rejects unsafe links, invalid dates, and empty impacts", async () => {
    for (const meetingLink of ["javascript:alert(1)", "http://example.com", "https://user:password@example.com"]) expect((await previewSuspensionAction(req({ mode: "VIRTUAL", meetingLink }))).ok).toBe(false);
    expect((await previewSuspensionAction(req({ start: "2026-02-31", end: "2026-03-04" }))).ok).toBe(false);
    vi.mocked(planSuspension).mockResolvedValue({ items: [], blockers: [], notes: [] });
    expect((await applySuspensionAction(req())).ok).toBe(false);
    expect(writePlan).not.toHaveBeenCalled();
  });

  it.each(["SUPER_ADMINISTRATOR", "FACULTY", "STUDENT"])("refuses class changes from %s even when called directly", async (role) => {
    scopeRef.scope = { ...hod, role };
    expect((await previewSuspensionAction(req())).ok).toBe(false);
    expect(db.section.findMany).not.toHaveBeenCalled();
  });

  it("does not grant authority to inactive heads or let restricted heads lift another program's order", async () => {
    scopeRef.scope = { ...hod, status: "INACTIVE" };
    expect((await previewSuspensionAction(req())).ok).toBe(false);
    scopeRef.scope = { ...hod, programIds: ["p2"] };
    db.classSuspension.findUnique.mockResolvedValue({ id: "sus-1", status: "ACTIVE", sectionIds: ["s1"], departmentId: "computer", batchId: "batch-1", title: "Typhoon" });
    expect((await liftSuspensionAction("sus-1")).ok).toBe(false);
    expect(undoBatch).not.toHaveBeenCalled();
  });
});
