import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ scope: vi.fn(), preview: vi.fn(), create: vi.fn(), update: vi.fn(), find: vi.fn(), audit: vi.fn() }));
vi.mock("@/lib/permissions/scope", () => ({ requireScope: m.scope, canManageDepartment: (scope: { isAdmin: boolean; departmentId?: string; departmentIds?: string[] }, id: string | null) => scope.isAdmin || (scope.departmentIds ?? [scope.departmentId]).includes(id ?? ""), OUTSIDE_DEPARTMENT: "Outside department" }));
vi.mock("@/lib/scheduler/policy-admin", () => ({ previewClassPolicy: m.preview }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { schedulingConstraint: { create: m.create, update: m.update, findUnique: m.find }, auditLog: { create: m.audit } } }));
import { previewConstraintAction, saveConstraintAction } from "@/app/(dashboard)/constraints/actions";

const input = () => ({ kind: "DELIVERY_MODE" as const, name: "First-year minor subjects online", departmentId: "cs", enabled: true, params: { target: { yearLevel: "FIRST", subjectCategory: "MINOR" }, allowedModes: ["ONLINE_LIVE"], defaultMode: "ONLINE_LIVE" } });

describe("scoped class policy actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.scope.mockResolvedValue({ userId: "head", role: "HEAD_OF_DEPARTMENT", isAdmin: false, departmentId: "cs" });
    m.preview.mockResolvedValue({ token: "current-preview", matching: 3, affected: 2, published: 1 });
    m.create.mockResolvedValue({ id: "created" });
    m.find.mockResolvedValue({ kind: "DELIVERY_MODE", departmentId: "cs" });
  });

  it("requires a current impact preview before changing scheduling policies", async () => {
    expect(await saveConstraintAction(null, input())).toMatchObject({ ok: false, error: expect.stringContaining("Preview") });
    expect(await saveConstraintAction(null, { ...input(), previewToken: "stale" })).toMatchObject({ ok: false });
    expect(m.create).not.toHaveBeenCalled();
    expect(m.audit).not.toHaveBeenCalled();
  });

  it("saves the combined target under the Head's department and never persists a preview token", async () => {
    expect(await saveConstraintAction(null, { ...input(), previewToken: "current-preview" })).toEqual({ ok: true });
    expect(m.create).toHaveBeenCalledWith({ data: expect.objectContaining({ departmentId: "cs", kind: "DELIVERY_MODE", params: expect.objectContaining({ target: expect.objectContaining({ yearLevel: "FIRST", subjectCategory: "MINOR" }) }) }) });
    expect(m.create.mock.calls[0][0].data).not.toHaveProperty("previewToken");
    expect(m.audit).toHaveBeenCalledOnce();
  });

  it("exposes affected counts through a read-only preview", async () => {
    expect(await previewConstraintAction(null, input())).toMatchObject({ ok: true, matching: 3, affected: 2, published: 1, token: "current-preview" });
    expect(m.preview).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ departmentId: "cs", id: "new" }));
    expect(m.create).not.toHaveBeenCalled();
  });

  it("refuses editing another department's stored policy", async () => {
    m.find.mockResolvedValue({ kind: "DELIVERY_MODE", departmentId: "foreign" });
    expect(await previewConstraintAction("foreign-rule", input())).toMatchObject({ ok: false, error: "Outside department" });
    expect(await saveConstraintAction("foreign-rule", { ...input(), previewToken: "current-preview" })).toMatchObject({ ok: false });
    expect(m.update).not.toHaveBeenCalled();
  });

  it("rejects a forged department before previewing or saving", async () => {
    const forged = { ...input(), departmentId: "foreign", previewToken: "current-preview" };
    expect(await previewConstraintAction(null, forged)).toMatchObject({ ok: false, error: "Outside department" });
    expect(await saveConstraintAction(null, forged)).toMatchObject({ ok: false, error: "Outside department" });
    expect(m.preview).not.toHaveBeenCalled(); expect(m.create).not.toHaveBeenCalled();
  });

  it("lets a Head choose another department they are authorized to manage", async () => {
    m.scope.mockResolvedValue({ userId: "head", role: "HEAD_OF_DEPARTMENT", isAdmin: false, departmentId: "cs", departmentIds: ["cs", "educ"] });
    expect(await saveConstraintAction(null, { ...input(), departmentId: "educ", previewToken: "current-preview" })).toEqual({ ok: true });
    expect(m.create).toHaveBeenCalledWith({ data: expect.objectContaining({ departmentId: "educ" }) });
  });

  it("rejects invalid defaults and removed or inaccessible target records", async () => {
    expect(await previewConstraintAction(null, { ...input(), params: { ...input().params, defaultMode: "IN_PERSON" } })).toMatchObject({ ok: false, error: expect.stringContaining("default delivery mode") });
    expect(m.preview).not.toHaveBeenCalled();
    m.preview.mockRejectedValue(new Error("The target is outside this department."));
    expect(await previewConstraintAction(null, input())).toMatchObject({ ok: false, error: expect.stringContaining("outside this department") });
    expect(m.create).not.toHaveBeenCalled();
  });
});
