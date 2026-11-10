import { describe, expect, it } from "vitest";
import { activeHrefFor, allowedHrefsForRole, filterNavForRole } from "@/components/layout/nav-config";
import { canAccessPath } from "@/lib/permissions/routes";
import { ROLES } from "@/lib/permissions/roles";

describe("role-focused sidebar navigation", () => {
  it("puts academic setup first for the Registrar", () => {
    const groups = filterNavForRole("REGISTRAR");
    expect(groups[1].label).toBe("Academic Setup");
    expect(groups[1].items.map((item) => item.href)).toEqual(["/academic-years", "/programs", "/subjects", "/sections", "/faculty", "/rooms", "/admin/departments", "/import"]);
    expect(allowedHrefsForRole("REGISTRAR")).toContain("/admin/scheduling-periods");
  });

  it("makes department scheduling and approvals directly accessible to Heads", () => {
    const groups = filterNavForRole("HEAD_OF_DEPARTMENT");
    expect(groups[0].items.map((item) => item.href)).toEqual(["/dashboard", "/scheduler"]);
    expect(groups[1].items.map((item) => item.href)).toEqual(["/bookings", "/adjustments", "/requests", "/workload"]);
    expect(groups[1].items.every((item) => !item.match)).toBe(true);
  });

  it("focuses Faculty on viewing their teaching and submitting unavailability", () => {
    const paths = allowedHrefsForRole("FACULTY");
    expect(paths).toEqual(["/dashboard", "/scheduler", "/availability", "/my-subjects", "/workload", "/calendar", "/notifications"]);
    for (const path of ["/requests", "/bookings", "/assistant", "/academic-years", "/admin/review-center"]) expect(paths).not.toContain(path);
  });

  it("prioritizes school-wide monitoring for the Administrator", () => {
    const groups = filterNavForRole("SUPER_ADMINISTRATOR");
    expect(groups[0].label).toBe("School Monitoring");
    expect(groups[0].items.map((item) => item.href)).toEqual(["/dashboard", "/analytics", "/admin/review-center", "/reports", "/workload"]);
    expect(allowedHrefsForRole("SUPER_ADMINISTRATOR")).toContain("/admin/audit-logs");
  });

  it("uses authorized destinations without duplicate sidebar links", () => {
    for (const role of ROLES.filter((role) => role !== "STUDENT")) {
      const groups = filterNavForRole(role);
      const paths = groups.flatMap((group) => group.items.flatMap((item) => item.match ?? [item.href]));
      expect(new Set(paths).size, role).toBe(paths.length);
      expect(paths.sort(), role).toEqual(allowedHrefsForRole(role).sort());
      for (const path of paths) expect(canAccessPath(path, role), `${role}: ${path}`).toBe(true);
    }
  });

  it("keeps Student navigation in the viewing-only portal", () => {
    const groups = filterNavForRole("STUDENT");
    expect(groups[0].label).toBe("My Timetable");
    expect(groups.flatMap((group) => group.items.map((item) => item.href))).toEqual(["/student", "/student/schedule", "/student/subjects", "/student/calendar", "/student/notifications", "/student/profile"]);
    expect(groups[0].items[1].label).toBe("My Timetable");
    for (const item of groups.flatMap((group) => group.items)) expect(canAccessPath(item.href, "STUDENT")).toBe(true);
  });

  it("highlights direct destinations and folded reference groups correctly", () => {
    expect(activeHrefFor("/programs/bsit", "REGISTRAR")).toBe("/programs");
    expect(activeHrefFor("/subjects/bsit", "HEAD_OF_DEPARTMENT")).toBe("/programs");
    expect(activeHrefFor("/admin/audit-logs", "SUPER_ADMINISTRATOR")).toBe("/admin/audit-logs");
    expect(activeHrefFor("/availability", "FACULTY")).toBe("/availability");
    expect(activeHrefFor("/admin/users", "FACULTY")).toBeUndefined();
  });
});
