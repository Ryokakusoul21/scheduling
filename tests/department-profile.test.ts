import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ scope: vi.fn(), session: vi.fn(), current: vi.fn(), clash: vi.fn(), update: vi.fn(), audit: vi.fn(), transaction: vi.fn(), saveLogo: vi.fn(), deleteLogo: vi.fn(), refresh: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/permissions/scope", () => ({ requireScope: mocks.scope, policyUserFromScope: (s: Record<string, unknown>) => ({ ...s, id: s.userId }) }));
vi.mock("@/lib/auth/session", () => ({ getSession: mocks.session }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { department: { findUnique: mocks.current, findFirst: mocks.clash }, $transaction: mocks.transaction } }));
vi.mock("@/lib/departments/logo-storage", () => ({ saveDepartmentLogo: mocks.saveLogo, deleteDepartmentLogo: mocks.deleteLogo, DepartmentLogoError: class DepartmentLogoError extends Error {} }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.refresh }));
import { saveDepartmentProfileAction } from "@/app/(dashboard)/department/actions";
import { DEPARTMENT_LOGO_MAX_BYTES } from "@/lib/departments/branding";

const now = new Date("2026-11-13T03:00:00.000Z");
const head = { userId: "head", role: "HEAD_OF_DEPARTMENT", status: "ACTIVE", archivedAt: null, departmentIds: ["cs"], actingDepartmentIds: ["acting"] };
function form(logo = false) {
  const input = new FormData(); input.set("name", "Computing Department"); input.set("updatedAt", now.toISOString()); input.set("removeLogo", "false");
  if (logo) input.set("logo", new File([new Uint8Array([137, 80, 78, 71])], "logo.png", { type: "image/png" }));
  return input;
}

describe("department profile saves", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.scope.mockImplementation(async (...roles: string[]) => {
      if (!roles.includes(head.role)) throw new Error("Forbidden");
      return { ...head };
    });
    mocks.session.mockResolvedValue({ user: { id: "head" } });
    mocks.current.mockResolvedValue({ name: "Computer Studies", logoUrl: "/api/department-logos/old.webp", updatedAt: now });
    mocks.clash.mockResolvedValue(null); mocks.update.mockResolvedValue({ count: 1 });
    mocks.saveLogo.mockResolvedValue("/api/department-logos/new.webp"); mocks.deleteLogo.mockResolvedValue(undefined);
    mocks.transaction.mockImplementation(async (fn) => fn({ department: { updateMany: mocks.update }, auditLog: { create: mocks.audit } }));
  });

  it("saves the Head's name and logo together, audits changes, and deletes the old logo after commit", async () => {
    const input = form(true); input.set("code", "HACKED"); input.set("departmentId", "foreign"); input.set("heads", "someone");
    const result = await saveDepartmentProfileAction("cs", input);
    expect(result).toMatchObject({ ok: true, profile: { name: "Computing Department", logoUrl: "/api/department-logos/new.webp" } });
    expect(mocks.update.mock.calls[0][0]).toMatchObject({ where: { id: "cs", updatedAt: now }, data: { name: "Computing Department", logoUrl: "/api/department-logos/new.webp" } });
    expect(Object.keys(mocks.update.mock.calls[0][0].data).sort()).toEqual(["logoUrl", "name", "updatedAt"]);
    expect(mocks.audit).toHaveBeenCalledWith({ data: expect.objectContaining({ userId: "head", role: "HEAD_OF_DEPARTMENT", departmentId: "cs", oldValue: { name: "Computer Studies", logoUrl: "/api/department-logos/old.webp" } }) });
    expect(mocks.deleteLogo).toHaveBeenCalledWith("/api/department-logos/old.webp");
    expect(mocks.deleteLogo.mock.invocationCallOrder[0]).toBeGreaterThan(mocks.audit.mock.invocationCallOrder[0]);
  });

  it("refuses foreign departments before processing a file or accessing the record", async () => {
    expect(await saveDepartmentProfileAction("foreign", form(true))).toMatchObject({ ok: false });
    expect(mocks.current).not.toHaveBeenCalled(); expect(mocks.saveLogo).not.toHaveBeenCalled();
  });

  it("supports a currently assigned acting department", async () => {
    expect(await saveDepartmentProfileAction("acting", form(true))).toMatchObject({ ok: true });
    expect(mocks.update.mock.calls[0][0].where.id).toBe("acting");
  });

  it.each(["FACULTY", "STUDENT"])("refuses %s even if they know the department ID", async (role) => {
    mocks.scope.mockImplementation(async (...roles: string[]) => {
      if (!roles.includes(role)) throw new Error("Forbidden");
      return { ...head, role };
    });
    await expect(saveDepartmentProfileAction("cs", form(true))).rejects.toThrow("Forbidden");
    expect(mocks.current).not.toHaveBeenCalled(); expect(mocks.saveLogo).not.toHaveBeenCalled();
  });

  it("refuses inactive or unassigned Heads and viewing-as sessions before file storage", async () => {
    mocks.scope.mockResolvedValueOnce({ ...head, status: "SUSPENDED" });
    expect(await saveDepartmentProfileAction("cs", form(true))).toMatchObject({ ok: false });
    mocks.scope.mockResolvedValueOnce({ ...head, departmentIds: [], actingDepartmentIds: [] });
    expect(await saveDepartmentProfileAction("cs", form(true))).toMatchObject({ ok: false });
    mocks.session.mockResolvedValueOnce({ user: { id: "head", realId: "admin" } });
    expect(await saveDepartmentProfileAction("cs", form(true))).toMatchObject({ ok: false });
    expect(mocks.saveLogo).not.toHaveBeenCalled();
  });

  it("removes a logo only when the profile is saved", async () => {
    const input = form(); input.set("removeLogo", "true");
    expect(await saveDepartmentProfileAction("cs", input)).toMatchObject({ ok: true, profile: { logoUrl: null } });
    expect(mocks.update.mock.calls[0][0].data.logoUrl).toBeNull();
    expect(mocks.saveLogo).not.toHaveBeenCalled();
  });

  it("rejects duplicate names, invalid names and stale edits without writing uploads", async () => {
    mocks.clash.mockResolvedValueOnce({ id: "foreign" });
    expect(await saveDepartmentProfileAction("cs", form(true))).toMatchObject({ ok: false, error: expect.stringContaining("already uses") });
    const invalid = form(true); invalid.set("name", " ");
    expect(await saveDepartmentProfileAction("cs", invalid)).toMatchObject({ ok: false });
    const stale = form(true); stale.set("updatedAt", "2020-01-01T00:00:00.000Z");
    expect(await saveDepartmentProfileAction("cs", stale)).toMatchObject({ ok: false, error: expect.stringContaining("updated by someone else") });
    expect(mocks.saveLogo).not.toHaveBeenCalled();
  });

  it("rejects files above 2 MB and conflicting remove/replace requests", async () => {
    const oversized = form(); oversized.set("logo", new File([new Uint8Array(DEPARTMENT_LOGO_MAX_BYTES + 1)], "large.png", { type: "image/png" }));
    expect(await saveDepartmentProfileAction("cs", oversized)).toMatchObject({ ok: false });
    const conflict = form(true); conflict.set("removeLogo", "true");
    expect(await saveDepartmentProfileAction("cs", conflict)).toMatchObject({ ok: false });
    expect(mocks.saveLogo).not.toHaveBeenCalled();
  });

  it("discards a new upload if another editor wins the save, retaining the original logo", async () => {
    mocks.update.mockResolvedValueOnce({ count: 0 });
    expect(await saveDepartmentProfileAction("cs", form(true))).toMatchObject({ ok: false, error: expect.stringContaining("updated by someone else") });
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.deleteLogo).toHaveBeenCalledExactlyOnceWith("/api/department-logos/new.webp");
  });

  it("cleans up an uploaded file when the transaction fails", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      mocks.transaction.mockRejectedValueOnce(new Error("offline"));
      expect(await saveDepartmentProfileAction("cs", form(true))).toMatchObject({ ok: false });
      expect(mocks.deleteLogo).toHaveBeenCalledExactlyOnceWith("/api/department-logos/new.webp");
    } finally { log.mockRestore(); }
  });
});
