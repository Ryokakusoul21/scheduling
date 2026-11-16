import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  scope: vi.fn(), create: vi.fn(), find: vi.fn(), update: vi.fn(), updateUser: vi.fn(), audit: vi.fn(), transaction: vi.fn(), workload: vi.fn(),
}));
vi.mock("@/lib/permissions/scope", () => ({
  requireScope: mocks.scope,
  policyUserFromScope: (scope: { role: string }) => scope,
  canManageDepartment: () => true,
  OUTSIDE_DEPARTMENT: "Outside department",
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: {
  faculty: { create: mocks.create, findUnique: mocks.find },
  $transaction: mocks.transaction,
} }));
vi.mock("@/lib/workload/auto", () => ({ queueWorkloadCheck: mocks.workload }));

import { createFacultyAction, updateFacultyAction } from "@/app/(dashboard)/faculty/actions";

function facultyForm() {
  const form = new FormData();
  for (const [key, value] of Object.entries({ employeeId: "GC-019", fullName: "Demo Faculty", email: "faculty@example.com", departmentId: "computing", maxHours: "24", status: "ACTIVE", employmentType: "FULL_TIME", teachingLevels: "COLLEGE" })) form.set(key, value);
  return form;
}

describe("faculty information permissions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.find.mockResolvedValue({ departmentId: "computing" });
    mocks.update.mockResolvedValue({ user: null });
    mocks.transaction.mockImplementation(async (work) => work({ $executeRaw: vi.fn(), faculty: { update: mocks.update }, user: { update: mocks.updateUser, findMany: vi.fn(async () => []) }, auditLog: { create: mocks.audit } }));
  });

  it("rejects direct create and update requests from a Head of Department before accessing faculty records", async () => {
    mocks.scope.mockResolvedValue({ role: "HEAD_OF_DEPARTMENT", status: "ACTIVE", departmentId: "computing", departmentIds: ["computing"], isAdmin: false });
    for (const result of [await createFacultyAction(facultyForm()), await updateFacultyAction("faculty", facultyForm())]) {
      expect(result).toMatchObject({ ok: false, error: expect.stringContaining("read-only") });
    }
    expect(mocks.find).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.workload).not.toHaveBeenCalled();
  });

  it.each(["REGISTRAR", "SUPER_ADMINISTRATOR"])("preserves faculty creation and editing for %s", async (role) => {
    mocks.scope.mockResolvedValue({ role, status: "ACTIVE", isAdmin: true });
    expect(await createFacultyAction(facultyForm())).toEqual({ ok: true });
    expect(await updateFacultyAction("faculty", facultyForm())).toEqual({ ok: true });
    expect(mocks.create).toHaveBeenCalledOnce();
    expect(mocks.update).toHaveBeenCalledOnce();
  });
  it("syncs a linked account name after a Registrar edit without changing login credentials, status, or head authority", async () => {
    mocks.scope.mockResolvedValue({ role: "REGISTRAR", userId: "registrar", status: "ACTIVE", isAdmin: true });
    mocks.update.mockResolvedValue({ fullName: "Updated faculty name", user: { id: "account", name: "Old faculty name" } });
    expect(await updateFacultyAction("faculty", facultyForm())).toEqual({ ok: true });
    expect(mocks.updateUser).toHaveBeenCalledWith({ where: { id: "account" }, data: { name: "Updated faculty name" } });
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ entity: "User", entityId: "account", action: "Synced account name from Registrar faculty record" }) }));
  });
});
