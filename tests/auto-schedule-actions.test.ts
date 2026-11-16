import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ role: "HEAD_OF_DEPARTMENT", scope: vi.fn(), preview: vi.fn(), apply: vi.fn() }));
vi.mock("@/lib/permissions/scope", () => ({ requireScope: m.scope }));
vi.mock("@/lib/scheduler/auto-schedule", () => ({ previewAutoSchedule: m.preview, applyAutoSchedule: m.apply, AutoScheduleError: class extends Error {} }));
import { previewAutoScheduleAction, applyAutoScheduleAction } from "@/app/(dashboard)/scheduler/auto-schedule-actions";

beforeEach(() => {
  vi.resetAllMocks(); m.role = "HEAD_OF_DEPARTMENT";
  m.scope.mockImplementation(async (...roles: string[]) => { if (!roles.includes(m.role)) throw new Error("Forbidden"); return { userId: "head", role: m.role }; });
  m.preview.mockResolvedValue({ proposalId: "preview", proposal: { changes: [] }, summary: "No changes" });
  m.apply.mockResolvedValue([]);
});
describe("auto-schedule action boundaries", () => {
  it.each(["REGISTRAR", "SUPER_ADMINISTRATOR", "FACULTY", "STUDENT"])("does not let %s create new department drafts", async (role) => {
    m.role = role;
    await expect(previewAutoScheduleAction({ sectionIds: ["s1"] })).rejects.toThrow("Forbidden");
    await expect(applyAutoScheduleAction({ proposalId: "preview", changeIds: ["c1"] })).rejects.toThrow("Forbidden");
    expect(m.preview).not.toHaveBeenCalled(); expect(m.apply).not.toHaveBeenCalled();
  });
  it("rejects empty scope or selection without invoking the scheduler", async () => {
    expect(await previewAutoScheduleAction({ sectionIds: [] })).toMatchObject({ ok: false });
    expect(await applyAutoScheduleAction({ proposalId: "preview", changeIds: [] })).toMatchObject({ ok: false });
    expect(m.preview).not.toHaveBeenCalled(); expect(m.apply).not.toHaveBeenCalled();
  });
  it("uses the authenticated user and saves only ids from a server preview", async () => {
    expect(await previewAutoScheduleAction({ sectionIds: ["s1", "s1"] })).toMatchObject({ ok: true });
    expect(m.preview).toHaveBeenCalledWith({ userId: "head", role: "HEAD_OF_DEPARTMENT" }, ["s1"]);
    expect(await applyAutoScheduleAction({ proposalId: "preview", changeIds: ["c1"] })).toMatchObject({ ok: true });
    expect(m.apply).toHaveBeenCalledWith({ userId: "head", role: "HEAD_OF_DEPARTMENT" }, "preview", ["c1"]);
  });
});
