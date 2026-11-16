import { describe, expect, it } from "vitest";
import { conflictingDepartmentHead, type DepartmentHeadRecord } from "@/lib/departments/heads";

const now = new Date("2026-11-13T08:00:00Z");
const head = (id: string, departmentId: string | null = null): DepartmentHeadRecord => ({ id, name: id, faculty: departmentId ? { departmentId } : null, departmentAssignments: [] });
const assignment = (departmentId: string, startsAt: string | null = null, endsAt: string | null = null) => ({ departmentId, startsAt: startsAt ? new Date(startsAt) : null, endsAt: endsAt ? new Date(endsAt) : null });

describe("one active head per department", () => {
  it("detects two faculty-linked heads of the same department", () => {
    const existing = head("existing", "cs");
    expect(conflictingDepartmentHead([existing, head("new", "cs")], "new", now)).toBe(existing);
  });

  it("detects an explicit assignment conflicting with implicit faculty authority", () => {
    const candidate = { ...head("new"), departmentAssignments: [assignment("cs")] };
    expect(conflictingDepartmentHead([head("existing", "cs"), candidate], "new", now)?.id).toBe("existing");
  });

  it("allows multiple authority sources for the same person and different heads in different departments", () => {
    const existing = { ...head("existing", "cs"), departmentAssignments: [assignment("cs")] };
    expect(conflictingDepartmentHead([existing, head("other", "business")], "existing", now)).toBeUndefined();
    expect(conflictingDepartmentHead([existing], "missing-or-inactive", now)).toBeUndefined();
  });

  it("reserves future appointments so a permanent assignment cannot create a later conflict", () => {
    const future = { ...head("future"), departmentAssignments: [assignment("cs", "2027-01-01T00:00:00Z")] };
    expect(conflictingDepartmentHead([future, head("new", "cs")], "new", now)?.id).toBe("future");
  });

  it("allows expired assignments and non-overlapping handovers", () => {
    const previous = { ...head("previous"), departmentAssignments: [assignment("cs", null, "2026-11-13T07:59:59Z")] };
    const future = { ...head("future"), departmentAssignments: [assignment("cs", "2027-01-01T00:00:00Z")] };
    const current = { ...head("current"), departmentAssignments: [assignment("cs", null, "2026-12-31T23:59:59Z")] };
    expect(conflictingDepartmentHead([previous, future, current], "current", now)).toBeUndefined();
  });

  it("treats assignment end dates as inclusive, matching permission scope", () => {
    const first = { ...head("first"), departmentAssignments: [assignment("cs", null, "2027-01-01T00:00:00Z")] };
    const next = { ...head("next"), departmentAssignments: [assignment("cs", "2027-01-01T00:00:00Z")] };
    expect(conflictingDepartmentHead([first, next], "next", now)?.id).toBe("first");
  });
});
