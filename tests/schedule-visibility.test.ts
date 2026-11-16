import { describe, expect, it } from "vitest";
import { publishedFilter, submittedTimetableFilter } from "@/lib/scheduler/visibility";
import { scopeQuery } from "@/lib/permissions/policy";

describe("schedule visibility", () => {
  it("limits faculty and students to published timetables", () => {
    expect(publishedFilter("FACULTY")).toEqual({ status: "PUBLISHED" });
    expect(publishedFilter("STUDENT")).toEqual({ status: "PUBLISHED" });
  });

  it("leaves management roles to their scope", () => {
    for (const role of ["HEAD_OF_DEPARTMENT", "REGISTRAR", "SUPER_ADMINISTRATOR"]) expect(publishedFilter(role)).toEqual({});
  });

  it.each(["SUPER_ADMINISTRATOR", "REGISTRAR"])("requires a submitted package or publication in %s queries", (role) => {
    const filter = submittedTimetableFilter(role);
    expect(filter).toEqual({ OR: [
      { status: "PUBLISHED" },
      { status: "REVIEW", submission: { is: { status: { in: ["SUBMITTED", "APPROVED"] } } } },
    ] });
    const user = { role, status: "ACTIVE" };
    expect(scopeQuery(user, "schedule")).toEqual(filter);
    expect(scopeQuery(user, "examination")).toEqual(filter);
    expect(scopeQuery(user, "scheduleAdjustment")).toEqual({ schedule: filter });
    expect(scopeQuery(user, "program")).toEqual({});
  });

  it("preserves the Head's department and program draft access", () => {
    expect(submittedTimetableFilter("HEAD_OF_DEPARTMENT")).toEqual({});
    expect(scopeQuery({ role: "HEAD_OF_DEPARTMENT", status: "ACTIVE", departmentIds: ["cs"], programIds: ["bsit"] }, "schedule")).toEqual({ section: { departmentId: { in: ["cs"] }, programId: { in: ["bsit"] } } });
  });
});
