import { beforeEach, describe, expect, it, vi } from "vitest";
import { Children, isValidElement, type ComponentProps, type ReactElement } from "react";
import type { Scope } from "@/lib/permissions/scope";

const mocks = vi.hoisted(() => ({ scope: vi.fn(), schedules: vi.fn(), rooms: vi.fn(), faculty: vi.fn(), departments: vi.fn(), terms: vi.fn() }));
vi.mock("@/lib/permissions/scope", () => ({ requireScope: mocks.scope }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { schedule: { findMany: mocks.schedules }, room: { findMany: mocks.rooms }, faculty: { findMany: mocks.faculty }, department: { findMany: mocks.departments }, semester: { findMany: mocks.terms } } }));
vi.mock("@/components/dashboard/admin-panels", () => ({ AdminPanels: () => null }));
vi.mock("@/components/bookings/override-report", () => ({ OverrideReport: () => null }));
vi.mock("@/app/(dashboard)/analytics/analytics-charts", () => ({ AnalyticsCharts: () => null }));

import AnalyticsPage from "@/app/(dashboard)/analytics/page";
import { AnalyticsCharts } from "@/app/(dashboard)/analytics/analytics-charts";

const scope: Scope = { userId: "head", name: "Head", role: "HEAD_OF_DEPARTMENT", status: "ACTIVE", archivedAt: null, facultyId: null, departmentId: "cs", departmentIds: ["cs"], actingDepartmentIds: [], programIds: ["bsit"], manageDepartmentId: "cs", isAdmin: false };
const term = { id: "term", level: "COLLEGE", type: "FIRST_SEMESTER", isActive: true, academicYear: { name: "2026–2027" }, startDate: new Date("2026-10-01"), endDate: new Date("2026-10-31") };

async function chartProps(params: Parameters<typeof AnalyticsPage>[0]["searchParams"] extends Promise<infer T> ? T : never) {
  const page = await AnalyticsPage({ searchParams: Promise.resolve(params) });
  return (Children.toArray(page.props.children).find((child) => isValidElement(child) && child.type === AnalyticsCharts) as ReactElement<ComponentProps<typeof AnalyticsCharts>>).props;
}

describe("analytics query boundaries", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.scope.mockResolvedValue(scope);
    mocks.terms.mockResolvedValue([term]);
    mocks.departments.mockResolvedValue([{ id: "cs", name: "Computing" }]);
    mocks.schedules.mockResolvedValue(["main", "annex"].map((building) => ({ id: building, roomId: building, facultyId: "teacher", sectionId: "section", status: "PUBLISHED", dayOfWeek: "MONDAY", startMin: 480, endMin: 540, semester: term })));
    mocks.rooms.mockResolvedValue(["main", "annex"].map((id) => ({ id, roomName: id, departmentId: "cs", availability: [], floor: { building: { id, name: id } } })));
    mocks.faculty.mockResolvedValue([{ id: "teacher", fullName: "Teacher", maxHours: 24, department: { name: "Computing" } }]);
  });

  it("applies department and program restrictions to schedules before calculating analytics", async () => {
    await chartProps({ department: "foreign" });
    expect(mocks.schedules.mock.calls[0][0].where.AND[0]).toEqual({ section: { departmentId: { in: ["cs"] }, programId: { in: ["bsit"] } } });
    expect(mocks.schedules.mock.calls[0][0].where.AND[1]).toMatchObject({ section: { departmentId: "cs" }, status: "PUBLISHED" });
    expect(mocks.faculty.mock.calls[0][0].where.AND[0]).toEqual({ departmentId: { in: ["cs"] } });
    expect(mocks.schedules).toHaveBeenCalledTimes(1);
  });

  it("uses published data by default and requires an explicit all-stage selection", async () => {
    expect((await chartProps({ status: "INVALID" })).filters.status).toBe("PUBLISHED");
    expect((await chartProps({ status: "ALL" })).filters.status).toBe("ALL");
    expect(mocks.schedules.mock.calls[1][0].where.AND[1].status).toEqual({ not: "ARCHIVED" });
  });

  it("applies the building selection to summaries, rates, and meeting counts together", async () => {
    const data = await chartProps({ building: "main" });
    expect(data.meetings).toBe(1);
    expect(data.insights.total).toBe(1);
    expect(data.rooms.map((room) => room.id)).toEqual(["main"]);
    expect(data.faculty[0].usedHours).toBe(1);
  });

  it("queries only the selected academic level's terms and faculty", async () => {
    await chartProps({ level: "COLLEGE" });
    expect(mocks.terms.mock.calls[0][0].where).toEqual({ level: "COLLEGE" });
    expect(mocks.faculty.mock.calls[0][0].where.AND[1].teachingLevels).toEqual({ has: "COLLEGE" });
  });
});
