import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Scope } from "@/lib/permissions/scope";

const mocks = vi.hoisted(() => ({ bookings: vi.fn(), departments: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { roomBooking: { findMany: mocks.bookings }, department: { findMany: mocks.departments } } }));
vi.mock("@/lib/permissions/scope", () => ({ policyUserFromScope: (scope: Scope) => ({ ...scope, id: scope.userId }) }));

import { overrideReport } from "@/lib/bookings/report";

const scope: Scope = { userId: "registrar", name: "Registrar", role: "REGISTRAR", status: "ACTIVE", archivedAt: null, facultyId: null, departmentId: null, departmentIds: [], actingDepartmentIds: [], programIds: [], manageDepartmentId: null, isAdmin: true };
const row = () => ({ id: "booking", purpose: "Accreditation", priority: "URGENT", status: "CONFIRMED", date: new Date("2026-11-16"), createdAt: new Date("2026-01-01"), departmentId: "cs", roomId: "room", room: { roomName: "Room 1" },
  acknowledgements: [{ facultyId: "own", status: "PENDING", respondedAt: null }, { facultyId: "foreign", status: "PENDING", respondedAt: null }],
  batch: { createdAt: new Date("2026-11-12"), undoneAt: null, adjustments: [{ scheduleId: "class", date: new Date("2026-11-16"), kind: "MOVED", schedule: { facultyId: "own", component: "LECTURE", subject: { code: "IT201" }, section: { name: "IT 2-A" } } }] },
});

describe("override report access and data scope", () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.bookings.mockResolvedValue([row()]); mocks.departments.mockResolvedValue([{ id: "cs", name: "Computing" }]); });

  it.each(["SUPER_ADMINISTRATOR", "FACULTY", "STUDENT"] as const)("does not expose the booking report to %s", async (role) => {
    expect(await overrideReport({ ...scope, role }, null)).toBeNull();
    expect(mocks.bookings).not.toHaveBeenCalled();
  });

  it("refuses inactive accounts and foreign department selections", async () => {
    expect(await overrideReport({ ...scope, status: "INACTIVE" }, null)).toBeNull();
    expect(await overrideReport({ ...scope, role: "HEAD_OF_DEPARTMENT", departmentIds: ["cs"] }, "foreign")).toBeNull();
    expect(mocks.bookings).not.toHaveBeenCalled();
  });

  it("restricts class details and acknowledgement counts to the head's assigned programs", async () => {
    const data = await overrideReport({ ...scope, role: "HEAD_OF_DEPARTMENT", isAdmin: false, departmentId: "cs", departmentIds: ["cs"], programIds: ["bsit"] }, "cs");
    expect(mocks.bookings.mock.calls[0][0].select.batch.select.adjustments.where.schedule).toEqual({ section: { departmentId: { in: ["cs"] }, programId: { in: ["bsit"] } } });
    expect(data?.entries[0].acknowledgements).toHaveLength(1);
    expect(data?.scopeName).toBe("Computing");
  });

  it("dates executed overrides by their applied batch and excludes pending workflow states", async () => {
    const data = await overrideReport(scope, null);
    expect(data?.entries[0].occurredAt).toBe("2026-11-12T00:00:00.000Z");
    expect(mocks.bookings.mock.calls[0][0].where.AND[0].OR[0].status.in).toEqual(["CONFIRMED", "COMPLETED", "NO_SHOW"]);
    expect(mocks.bookings.mock.calls[0][0].select.batch.select.adjustments.where.kind).toEqual({ not: "MAKE_UP" });
    expect(data?.entries[0].acknowledgements).toHaveLength(2);
  });
});
