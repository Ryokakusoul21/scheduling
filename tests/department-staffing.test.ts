import { describe, expect, it } from "vitest";
import { summarizeDepartmentStaffing } from "@/lib/analytics/department-staffing-summary";
import type { Assignment } from "@/lib/workload/optimizer";
import { canAccessPath } from "@/lib/permissions/routes";

const assignment = (overrides: Partial<Assignment> = {}): Assignment => ({
  key: "class-a",
  facultyId: "faculty-a",
  subjectName: "SCI Science",
  subjectUnits: 3,
  sectionName: "SCI 1",
  sectionLevel: "COLLEGE",
  departmentId: "science",
  meetings: [{ scheduleId: "schedule-a", dayOfWeek: "MONDAY", startMin: 480, endMin: 600 }],
  ...overrides,
});

describe("department staffing summary", () => {
  it("limits department management to school administrators", () => {
    expect(canAccessPath("/admin/departments", "REGISTRAR")).toBe(true);
    expect(canAccessPath("/admin/departments", "SUPER_ADMINISTRATOR")).toBe(true);
    expect(canAccessPath("/admin/departments", "HEAD_OF_DEPARTMENT")).toBe(false);
  });

  it("calculates faculty capacity, assigned hours, and overload by home department", () => {
    const [science] = summarizeDepartmentStaffing(
      [{ id: "science", code: "SCI", name: "Science" }],
      [
        { id: "faculty-a", departmentId: "science", maxCapacity: 8 },
        { id: "faculty-b", departmentId: "science", maxCapacity: 12 },
      ],
      [assignment()],
      [],
    );

    expect(science).toMatchObject({
      activeFaculty: 2,
      capacity: 20,
      assignedLoad: 2,
      demandLoad: 2,
      utilization: 10,
      availableCapacity: 18,
      additionalCapacityNeeded: 0,
      overloadedFaculty: 0,
      overload: 0,
      unassignedClasses: 0,
      recommendationLevel: "NONE",
    });
  });

  it("estimates additional capacity and prioritizes unassigned demand", () => {
    const [science] = summarizeDepartmentStaffing(
      [{ id: "science", code: "SCI", name: "Science" }],
      [{ id: "faculty-a", departmentId: "science", maxCapacity: 1 }],
      [assignment()],
      [assignment({ facultyId: "inactive-a", plannedHours: 4, meetings: [] })],
    );

    expect(science).toMatchObject({
      assignedLoad: 2,
      demandLoad: 6,
      utilization: 600,
      overloadedFaculty: 1,
      overload: 1,
      unassignedClasses: 1,
      unassignedLoad: 4,
      additionalCapacityNeeded: 5,
      facultyCapacityEquivalent: 5,
      recommendationLevel: "HIGH",
    });
    expect(science.recommendedAction).toContain("Secure at least 5 additional weekly hours");
    expect(science.recommendedAction).toContain("not a headcount target");
  });

  it("flags demand with no active faculty and does not invent a faculty-equivalent baseline", () => {
    const [department] = summarizeDepartmentStaffing(
      [{ id: "arts", code: "ART", name: "Arts" }],
      [],
      [],
      [assignment({ facultyId: "inactive-a", departmentId: "arts" })],
    );

    expect(department).toMatchObject({
      activeFaculty: 0,
      capacity: 0,
      utilization: null,
      unassignedClasses: 1,
      unassignedLoad: 2,
      additionalCapacityNeeded: 2,
      facultyCapacityEquivalent: null,
      recommendationLevel: "URGENT",
    });
    expect(department.recommendedAction).toContain("no active-faculty capacity baseline");
  });

  it("uses configured teaching units instead of meeting or curriculum hours", () => {
    const [science] = summarizeDepartmentStaffing(
      [{ id: "science", code: "SCI", name: "Science" }],
      [{ id: "faculty-a", departmentId: "science", maxCapacity: 2 }],
      [assignment({ subjectUnits: 3 })],
      [assignment({ facultyId: "inactive-a", subjectUnits: 4, plannedHours: 9, meetings: [] })],
      "UNITS",
    );

    expect(science).toMatchObject({
      measure: "UNITS",
      assignedLoad: 3,
      unassignedLoad: 4,
      demandLoad: 7,
      utilization: 350,
      additionalCapacityNeeded: 5,
      facultyCapacityEquivalent: 2.5,
    });
    expect(science.recommendedAction).toContain("additional teaching units");
  });

  it("recommends rebalancing when individual overload is covered by department capacity", () => {
    const [science] = summarizeDepartmentStaffing(
      [{ id: "science", code: "SCI", name: "Science" }],
      [
        { id: "faculty-a", departmentId: "science", maxCapacity: 8 },
        { id: "faculty-b", departmentId: "science", maxCapacity: 8 },
      ],
      [
        assignment({ facultyId: "faculty-a", meetings: [{ scheduleId: "a1", dayOfWeek: "MONDAY", startMin: 480, endMin: 1080 }] }),
        assignment({ facultyId: "faculty-b", meetings: [{ scheduleId: "b1", dayOfWeek: "TUESDAY", startMin: 480, endMin: 600 }] }),
      ],
      [],
    );

    expect(science).toMatchObject({
      additionalCapacityNeeded: 0,
      availableCapacity: 4,
      overloadedFaculty: 1,
      overload: 2,
      recommendationLevel: "REBALANCE",
    });
    expect(science.recommendedAction).toContain("active-term demand fits aggregate capacity");
  });
});
