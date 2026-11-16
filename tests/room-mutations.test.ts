import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ role: "HEAD_OF_DEPARTMENT", find: vi.fn(), aggregate: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn(), transaction: vi.fn(), archived: vi.fn(), active: vi.fn(), blocked: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requireRole: async (...roles: string[]) => { if (!roles.includes(m.role)) throw Error("FORBIDDEN"); return { id: "user", role: m.role }; } }));
vi.mock("@/lib/permissions/scope", () => ({
  requireScope: async (...roles: string[]) => {
    if (!roles.includes(m.role)) throw Error("FORBIDDEN");
    return { userId: "user", role: m.role, isAdmin: ["REGISTRAR", "SUPER_ADMINISTRATOR"].includes(m.role), status: "ACTIVE", departmentId: "cs", departmentIds: ["cs"], manageDepartmentId: "cs" };
  },
  policyUserFromScope: (scope: Record<string, unknown>) => ({ ...scope, id: scope.userId }),
  canManageDepartment: () => ["REGISTRAR", "SUPER_ADMINISTRATOR"].includes(m.role), OUTSIDE_DEPARTMENT: "Outside department",
}));
vi.mock("@/lib/permissions/department", () => ({ logBlocked: m.blocked }));
vi.mock("@/lib/subjects/permissions", () => ({ canManageSubject: vi.fn() }));
vi.mock("@/lib/sections/permissions", () => ({ canManageSection: vi.fn() }));
vi.mock("@/lib/workload/auto", () => ({ queueWorkloadCheck: vi.fn(), runWorkloadCheck: vi.fn() }));
vi.mock("@/lib/notify", () => ({ notifyFacultyEach: vi.fn() }));
vi.mock("@/lib/archive/archive", () => ({ activeClassesOf: m.active, setArchived: m.archived }));
vi.mock("@/lib/db/prisma", () => ({ prisma: {
  department: { findUnique: m.find },
  room: { findUnique: m.find, findMany: m.find, aggregate: m.aggregate, count: m.count, create: m.create, update: m.update },
  $transaction: m.transaction,
} }));
import { saveRoomAction, saveBuildingAction, saveFloorAction, deleteFloorAction, deleteBuildingAction, uploadBuildingPhotoAction, removeBuildingPhotoAction } from "@/app/(dashboard)/rooms/actions";
import { archiveRecordAction, restoreRecordAction } from "@/actions/archive";
import { reorderAction } from "@/actions/reorder";
import { validateImportAction, commitImportAction } from "@/app/(dashboard)/import/actions";

function form() { const fd = new FormData(); for (const [key, value] of Object.entries({ floorId: "floor", roomNumber: "101", roomName: "Room 101", capacity: "40", roomType: "LECTURE_ROOM", status: "AVAILABLE", departmentId: "cs" })) fd.set(key, value); return fd; }
describe("room mutation entry points", () => {
  beforeEach(() => { vi.clearAllMocks(); m.role = "HEAD_OF_DEPARTMENT"; m.find.mockResolvedValue({ departmentId: "cs" }); m.aggregate.mockResolvedValue({ _max: { sortOrder: 0 } }); m.active.mockResolvedValue([]); });
  it("rejects head room creation and editing before reading or writing records", async () => {
    await expect(saveRoomAction(null, form())).rejects.toThrow("FORBIDDEN");
    await expect(saveRoomAction("room", form())).rejects.toThrow("FORBIDDEN");
    expect(m.find).not.toHaveBeenCalled(); expect(m.create).not.toHaveBeenCalled(); expect(m.update).not.toHaveBeenCalled();
  });
  it("blocks room archiving and restoring, including own-department rooms", async () => {
    expect(await archiveRecordAction({ kind: "ROOM", id: "room", confirmed: true })).toMatchObject({ ok: false, error: expect.stringContaining("read-only") });
    expect(await restoreRecordAction("ROOM", "room")).toMatchObject({ ok: false, error: expect.stringContaining("read-only") });
    expect(m.find).not.toHaveBeenCalled(); expect(m.archived).not.toHaveBeenCalled(); expect(m.active).not.toHaveBeenCalled();
  });
  it("blocks direct room reordering even if the UI has no drag handle", async () => {
    expect(await reorderAction("room", ["r1", "r2"])).toMatchObject({ ok: false, error: expect.stringContaining("read-only") });
    expect(m.count).not.toHaveBeenCalled(); expect(m.update).not.toHaveBeenCalled(); expect(m.transaction).not.toHaveBeenCalled();
  });
  it("blocks room import validation and commits before database access", async () => {
    expect(await validateImportAction("rooms", [{}])).toMatchObject({ ok: false });
    expect(await commitImportAction("rooms", [{}])).toMatchObject({ ok: false });
    expect(await commitImportAction("ROOMS" as "rooms", [{}])).toMatchObject({ ok: false, error: "Invalid import type." });
    expect(m.find).not.toHaveBeenCalled(); expect(m.transaction).not.toHaveBeenCalled();
  });
  it("keeps buildings, floors, and photos administrative", async () => {
    for (const action of [() => saveBuildingAction(null, new FormData()), () => saveFloorAction(null, new FormData()), () => deleteFloorAction("floor"), () => deleteBuildingAction("building"), () => uploadBuildingPhotoAction("building", new FormData()), () => removeBuildingPhotoAction("building")]) await expect(action()).rejects.toThrow("FORBIDDEN");
  });
  it("uses one designation and clears legacy program selections when sharing a room", async () => {
    m.role = "REGISTRAR";
    const fd = form(); fd.set("departmentId", ""); fd.append("programIds", "legacy-program");
    expect(await saveRoomAction("room", fd)).toEqual({ ok: true });
    expect(m.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ departmentId: null, isGeneralShared: true, programs: { set: [] } }) }));
  });
  it.each([null, "room"])("saves Unassigned without treating it as a department or a shared room (%s)", async (id) => {
    m.role = "REGISTRAR";
    const fd = form(); fd.set("departmentId", "UNASSIGNED");
    expect(await saveRoomAction(id, fd)).toEqual({ ok: true });
    const write = id ? m.update : m.create;
    expect(write).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ departmentId: null, isGeneralShared: false }) }));
    expect(m.find).not.toHaveBeenCalledWith(expect.objectContaining({ where: { id: "UNASSIGNED" } }));
  });
  it("rejects a department that was removed before saving", async () => {
    m.role = "REGISTRAR"; m.find.mockResolvedValueOnce(null);
    expect(await saveRoomAction(null, form())).toMatchObject({ ok: false, error: expect.stringContaining("department no longer exists") });
    expect(m.create).not.toHaveBeenCalled();
  });
  it.each(["REGISTRAR", "SUPER_ADMINISTRATOR"])("keeps %s room creation and editing operational", async (role) => {
    m.role = role;
    expect(await saveRoomAction(null, form())).toEqual({ ok: true });
    expect(m.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ departmentId: "cs", isGeneralShared: false, programs: { connect: [] } }) }));
    expect(await saveRoomAction("room", form())).toEqual({ ok: true });
    expect(m.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "room" } }));
  });
});
