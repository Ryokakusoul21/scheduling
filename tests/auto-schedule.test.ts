import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Scope } from "@/lib/permissions/scope";
import { autoFixture } from "./fixtures/auto-schedule";
import { DEFAULT_OPTIONS, type Change, type ResolverInput } from "@/lib/scheduler/resolver/types";
import { solve } from "@/lib/scheduler/resolver/solver";
import { applyChanges } from "@/lib/scheduler/resolver/changes";

const m = vi.hoisted(() => ({ world: vi.fn(), sections: vi.fn(), record: vi.fn(), find: vi.fn(), claim: vi.fn(), schedules: vi.fn(), audit: vi.fn(), lock: vi.fn(), transaction: vi.fn() }));
vi.mock("@/lib/scheduler/resolver/server", () => ({ serverInput: m.world }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { section: { findMany: m.sections }, workloadProposal: { create: m.record }, $transaction: m.transaction } }));
import { applyAutoSchedule, autoScheduleBasis, previewAutoSchedule, validateAutoPlacements } from "@/lib/scheduler/auto-schedule";

const scope = { userId: "head", role: "HEAD_OF_DEPARTMENT", departmentId: "cs" } as Scope;
const options = (input: ResolverInput) => ({ ...DEFAULT_OPTIONS, sectionIds: input.sections.map((s) => s.id), kinds: ["UNSCHEDULED", "HOURS"] as ("UNSCHEDULED" | "HOURS")[], placementOnly: true, keepFaculty: true, retime: false, moveCompleteSections: false });
let world: ResolverInput;
let record: Record<string, unknown>;
beforeEach(() => {
  vi.resetAllMocks(); world = autoFixture(); record = {};
  m.sections.mockResolvedValue(world.sections.map((s) => ({ id: s.id, semesterId: s.termId })));
  m.world.mockImplementation(async () => world);
  m.record.mockImplementation(async ({ data }) => { record = { id: "proposal", version: 1, ...data }; return record; });
  m.find.mockImplementation(async () => record);
  m.claim.mockImplementation(async () => { if (record.status !== "PENDING") return { count: 0 }; record.status = "APPLIED"; return { count: 1 }; });
  m.transaction.mockImplementation(async (fn) => fn({ $executeRaw: m.lock, workloadProposal: { findUnique: m.find, updateMany: m.claim }, schedule: { createMany: m.schedules }, auditLog: { create: m.audit } }));
});

describe("Auto-Schedule planning", () => {
  it("places eight offerings with the assigned teacher and no shared resource overlaps", () => {
    const p = solve(world, options(world));
    expect(p.changes).toHaveLength(8);
    expect(p.unresolved).toEqual([]);
    expect(p.changes.every((c) => c.after?.facultyId === "ana" && !c.before)).toBe(true);
    expect(p.changes.reduce((sum, c) => sum + c.after!.endMin - c.after!.startMin, 0)).toBe(24 * 60);
    expect(() => validateAutoPlacements(world, p.changes)).not.toThrow();
  });
  it("keeps missing-teacher offerings blocked even when another teacher is available", () => {
    world.assignments = [];
    const p = solve(world, options(world));
    expect(p.changes).toEqual([]);
    expect(p.unresolved).toHaveLength(8);
    expect(p.unresolved.every((u) => u.reason.includes("Needs teacher"))).toBe(true);
  });
  it("never substitutes another teacher when the assigned teacher is unavailable", () => {
    world.faculty[0].assignable = false;
    const p = solve(world, { ...options(world), keepFaculty: false });
    expect(p.changes).toEqual([]);
    expect(p.unresolved.every((u) => u.reason.includes("assigned teacher"))).toBe(true);
  });
  it("reports room capacity blockers instead of silently dropping classes", () => {
    world.rooms[0].capacity = 20;
    const p = solve(world, options(world));
    expect(p.changes).toEqual([]);
    expect(p.unresolved[0].reason).toContain("seats 38");
  });
  it("adds only the final 90 minutes and leaves the existing published meeting in place", () => {
    const first = solve(autoFixture(1), options(autoFixture(1))).changes[0].after!;
    world = autoFixture(1);
    world.entries = [{ ...first, id: "published", status: "PUBLISHED", endMin: first.startMin + 90 }];
    const p = solve(world, options(world));
    expect(p.changes).toHaveLength(1);
    expect(p.changes[0].before).toBeNull();
    expect(p.changes[0].after!.endMin - p.changes[0].after!.startMin).toBe(90);
    expect(world.entries[0].endMin - world.entries[0].startMin).toBe(90);
  });
  it("does not trim or move existing meetings to fit a preview", () => {
    const e = solve(autoFixture(1), options(autoFixture(1))).changes[0].after!;
    world = autoFixture(1); world.entries = [{ ...e, id: "published", status: "PUBLISHED", endMin: e.startMin + 240 }];
    const p = solve(world, options(world));
    expect(p.changes).toEqual([]);
    expect(p.unresolved).toHaveLength(1);
  });
  it("does not create duplicate meetings on a second run", () => {
    const first = solve(world, options(world));
    world.entries = applyChanges(world.entries, first.changes);
    expect(solve(world, options(world)).changes).toEqual([]);
  });
});

describe("Auto-Schedule preview and commit", () => {
  it("stores a server preview without saving any meetings", async () => {
    const preview = await previewAutoSchedule(scope, world.sections.map((s) => s.id));
    expect(preview.proposalId).toBe("proposal");
    expect(m.schedules).not.toHaveBeenCalled();
    expect(record.basis).toBe(autoScheduleBasis(world));
  });
  it("atomically saves only selected drafts and applies a preview once", async () => {
    const preview = await previewAutoSchedule(scope, world.sections.map((s) => s.id));
    const saved = await applyAutoSchedule(scope, "proposal", preview.proposal.changes.slice(0, 2).map((c) => c.id));
    expect(saved).toHaveLength(2);
    expect(m.lock).toHaveBeenCalled();
    expect(m.schedules.mock.calls[0][0].data.every((e: { status: string }) => e.status === "DRAFT")).toBe(true);
    await expect(applyAutoSchedule(scope, "proposal", [preview.proposal.changes[0].id])).rejects.toThrow("no longer available");
    expect(m.schedules).toHaveBeenCalledTimes(1);
  });
  it.each(["teacher", "queue", "timetable"])("rejects a preview when the %s changed", async (kind) => {
    const preview = await previewAutoSchedule(scope, world.sections.map((s) => s.id));
    if (kind === "teacher") world.assignments![0].facultyId = "ben";
    if (kind === "queue") world.sections[0].curriculum = [];
    if (kind === "timetable") world.entries = [preview.proposal.changes[0].after!];
    await expect(applyAutoSchedule(scope, "proposal", preview.proposal.changes.map((c) => c.id))).rejects.toThrow("changed after this preview");
    expect(m.schedules).not.toHaveBeenCalled();
  });
  it("rejects another user's preview and forged selection ids", async () => {
    const p = await previewAutoSchedule(scope, world.sections.map((s) => s.id));
    await expect(applyAutoSchedule({ ...scope, userId: "other" }, "proposal", [p.proposal.changes[0].id])).rejects.toThrow("no longer available");
    await expect(applyAutoSchedule(scope, "proposal", ["forged"])).rejects.toThrow("valid meetings");
    expect(m.schedules).not.toHaveBeenCalled();
  });
  it("rejects read-only or locked sections before generating a preview", async () => {
    world.sections[0].editable = false;
    await expect(previewAutoSchedule(scope, world.sections.map((s) => s.id))).rejects.toThrow("open for editing");
    expect(m.record).not.toHaveBeenCalled();
  });
  it("does not change its snapshot when database result ordering changes", () => {
    const before = autoScheduleBasis(world);
    world.sections.reverse(); world.assignments!.reverse(); world.faculty.reverse();
    expect(autoScheduleBasis(world)).toBe(before);
  });
  it("refuses overlapping and over-hour placements even in a stored preview", () => {
    const p = solve(world, options(world));
    const overlapping = structuredClone(p.changes) as Change[];
    overlapping[1].after = { ...overlapping[0].after!, id: "other", sectionId: overlapping[1].sectionId };
    expect(() => validateAutoPlacements(world, overlapping)).toThrow();
    expect(() => validateAutoPlacements(world, [p.changes[0], { ...p.changes[0], id: "duplicate", after: { ...p.changes[0].after!, id: "duplicated-meeting" } }])).toThrow("remaining subject hours");
  });
});
