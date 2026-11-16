import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
const m = vi.hoisted(() => ({ role: "HEAD_OF_DEPARTMENT", find: vi.fn(), duplicate: vi.fn(), audit: vi.fn(), aggregate: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn(), transaction: vi.fn(), archived: vi.fn(), active: vi.fn(), blocked: vi.fn() }));
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
  room: { findUnique: m.find, findFirst: m.duplicate, findMany: m.find, aggregate: m.aggregate, count: m.count, create: m.create, update: m.update },
  $transaction: m.transaction,
} }));
import { saveRoomAction, saveBuildingAction, saveFloorAction, deleteFloorAction, deleteBuildingAction, uploadBuildingPhotoAction, removeBuildingPhotoAction } from "@/app/(dashboard)/rooms/actions";
import { archiveRecordAction, restoreRecordAction } from "@/actions/archive";
import { reorderAction } from "@/actions/reorder";
import { validateImportAction, commitImportAction } from "@/app/(dashboard)/import/actions";

function form() { const fd = new FormData(); for (const [key, value] of Object.entries({ floorId: "floor", roomNumber: "101", roomName: "Room 101", capacity: "40", roomType: "LECTURE_ROOM", status: "AVAILABLE", departmentId: "cs" })) fd.set(key, value); return fd; }
describe("room mutation entry points", () => {
  beforeEach(() => {
    vi.resetAllMocks(); m.role = "HEAD_OF_DEPARTMENT";
    m.find.mockResolvedValue({ departmentId: "cs" }); m.duplicate.mockResolvedValue(null);
    m.aggregate.mockResolvedValue({ _max: { sortOrder: 0 } }); m.active.mockResolvedValue([]);
    m.transaction.mockImplementation(async (callback) => callback({ room: { update: m.update }, auditLog: { create: m.audit } }));
  });
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
    expect(m.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "room", archivedAt: null } }));
  });

  it("creates a new room when its number is only used by archived records, without changing history", async () => {
    m.role = "REGISTRAR";
    const archived = { id: "archived-room", roomNumber: "101", departmentId: "cs", archivedAt: new Date(), floor: null };
    m.duplicate.mockImplementation(async ({ where }) => where.archivedAt === null ? null : archived);
    expect(await saveRoomAction(null, form())).toEqual({ ok: true });
    expect(m.duplicate).toHaveBeenCalledWith(expect.objectContaining({ where: { roomNumber: "101", archivedAt: null } }));
    expect(m.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ roomNumber: "101", roomName: "Room 101", availability: expect.any(Object) }) }));
    expect(m.create.mock.calls[0][0].data).not.toHaveProperty("id", archived.id);
    expect(m.update).not.toHaveBeenCalled(); expect(m.transaction).not.toHaveBeenCalled(); expect(m.archived).not.toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/rooms/[buildingId]", "page");
  });

  it("allows editing a room to reuse an archived number and excludes the edited room from duplicate checks", async () => {
    m.role = "REGISTRAR";
    expect(await saveRoomAction("active-room", form())).toEqual({ ok: true });
    expect(m.duplicate).toHaveBeenCalledWith(expect.objectContaining({ where: { roomNumber: "101", archivedAt: null, id: { not: "active-room" } } }));
    expect(m.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "active-room", archivedAt: null } }));
    expect(m.create).not.toHaveBeenCalled();
  });

  it.each(["REGISTRAR", "SUPER_ADMINISTRATOR"])("keeps archived rooms history only even when %s requests restoration", async (role) => {
    m.role = role;
    expect(await restoreRecordAction("ROOM", "archived-room")).toMatchObject({ ok: false, error: expect.stringContaining("cannot be restored") });
    expect(m.archived).not.toHaveBeenCalled(); expect(m.update).not.toHaveBeenCalled();
  });

  it("explains that archived room numbers can be reused after archiving", async () => {
    m.role = "REGISTRAR"; m.archived.mockResolvedValue("Room 101");
    expect(await archiveRecordAction({ kind: "ROOM", id: "room", confirmed: true })).toMatchObject({ ok: true, message: expect.stringContaining("room number can be used for a new room") });
    expect(revalidatePath).toHaveBeenCalledWith("/rooms/[buildingId]", "page");
  });

  it("identifies the location of an active duplicate", async () => {
    m.role = "REGISTRAR";
    m.duplicate.mockResolvedValue({ id: "active-room", departmentId: "cs", archivedAt: null, floor: { name: "Second Floor", building: { name: "Building B" } } });
    expect(await saveRoomAction(null, form())).toMatchObject({ ok: false, error: expect.stringContaining("active room in Building B, Second Floor") });
    expect(m.create).not.toHaveBeenCalled(); expect(m.update).not.toHaveBeenCalled();
  });

  it("does not allow a stale edit form to modify an archived room", async () => {
    m.role = "REGISTRAR"; m.find.mockResolvedValue({ departmentId: "cs", archivedAt: new Date() });
    expect(await saveRoomAction("room", form())).toMatchObject({ ok: false, error: expect.stringContaining("was archived") });
    expect(m.update).not.toHaveBeenCalled();
  });

  it.each([
    ["P2002", "active room already uses"],
    ["P2003", "floor or department no longer exists"],
    ["P2025", "room has changed or no longer exists"],
  ])("reports %s save failures accurately", async (code, message) => {
    m.role = "REGISTRAR";
    m.create.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError("Save failed", { code, clientVersion: "7" }));
    expect(await saveRoomAction(null, form())).toMatchObject({ ok: false, error: expect.stringContaining(message) });
  });

  it("does not label an unrelated database error as a duplicate room number", async () => {
    m.role = "REGISTRAR"; m.create.mockRejectedValueOnce(new Error("Connection failed"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try { expect(await saveRoomAction(null, form())).toEqual({ ok: false, error: "Could not save the room. Please try again." }); }
    finally { log.mockRestore(); }
  });
});
