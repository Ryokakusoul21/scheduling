import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ find: vi.fn(), remove: vi.fn(), audit: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/permissions/scope", () => ({ requireScope: vi.fn(async () => ({ userId: "registrar", role: "REGISTRAR" })) }));
vi.mock("@/lib/departments/head-guard", () => ({ assertSingleDepartmentHead: vi.fn(), lockDepartmentHeads: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: {
  department: { findUnique: mocks.find },
  $transaction: async (fn: (tx: unknown) => Promise<void>) => fn({ department: { delete: mocks.remove }, auditLog: { create: mocks.audit } }),
} }));

import { deleteDepartmentAction } from "@/app/(dashboard)/admin/departments/actions";

const counts = (c: Partial<Record<"programs" | "faculty" | "rooms" | "sections" | "subjects", number>>) => ({ code: "SCI", name: "College of Science", _count: { programs: 0, faculty: 0, rooms: 0, sections: 0, subjects: 0, ...c } });

describe("department deletion", () => {
  beforeEach(() => vi.clearAllMocks());
  it("blocks deletion while records are linked and lists them", async () => {
    mocks.find.mockResolvedValue(counts({ rooms: 5, sections: 19 }));
    expect(await deleteDepartmentAction("d")).toEqual({ ok: false, error: "Still linked: 5 rooms, 19 sections." });
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it("deletes an empty department and records it in the audit log", async () => {
    mocks.find.mockResolvedValue(counts({}));
    expect(await deleteDepartmentAction("d")).toEqual({ ok: true });
    expect(mocks.remove).toHaveBeenCalledWith({ where: { id: "d" } });
    expect(mocks.audit).toHaveBeenCalledOnce();
  });
});
