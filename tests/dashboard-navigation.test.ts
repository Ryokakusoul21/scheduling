import { describe, expect, it } from "vitest";
import { activeHrefFor, allowedHrefsForRole, filterNavForRole, tabsForPath } from "@/components/layout/nav-config";
import { canAccessPath } from "@/lib/permissions/routes";
import { ROLES } from "@/lib/permissions/roles";

describe("role-focused sidebar navigation", () => {
  it("merges the Registrar's academic setup into one direct workspace with all eight pages", () => {
    const groups = filterNavForRole("REGISTRAR");
    expect(groups[1].label).toBe("Academic Setup");
    const pages = ["/academic-years", "/programs", "/subjects", "/sections", "/faculty", "/rooms", "/admin/departments", "/import"];
    expect(groups[1].direct).toBe(true);
    expect(groups[1].items).toHaveLength(1);
    expect(groups[1].items[0]).toMatchObject({ href: "/academic-years", label: "Academic Setup", match: pages });
    for (const page of pages) {
      expect(tabsForPath(page, "REGISTRAR")?.map((item) => item.href)).toEqual(pages);
      expect(activeHrefFor(page, "REGISTRAR")).toBe("/academic-years");
      expect(allowedHrefsForRole("REGISTRAR")).toContain(page);
    }
    expect(allowedHrefsForRole("REGISTRAR")).toContain("/admin/scheduling-periods");
  });

  it("makes department scheduling and approvals directly accessible to Heads", () => {
    const groups = filterNavForRole("HEAD_OF_DEPARTMENT");
    expect(groups[0].items.map((item) => item.href)).toEqual(["/dashboard", "/scheduler"]);
    expect(groups[1].items.map((item) => item.href)).toEqual(["/bookings", "/adjustments", "/requests", "/workload"]);
    expect(groups[1].items.every((item) => !item.match)).toBe(true);
    expect(allowedHrefsForRole("HEAD_OF_DEPARTMENT")).toContain("/department");
    expect(canAccessPath("/department", "HEAD_OF_DEPARTMENT")).toBe(true);
    expect(canAccessPath("/department", "FACULTY")).toBe(false);
    expect(canAccessPath("/department", "STUDENT")).toBe(false);
  });

  it("lets Faculty submit change requests alongside unavailability", () => {
    const paths = allowedHrefsForRole("FACULTY");
    expect(paths).toEqual(["/dashboard", "/scheduler", "/requests", "/availability", "/my-subjects", "/workload", "/calendar"]);
    expect(filterNavForRole("FACULTY").flatMap((g) => g.items).find((item) => item.href === "/requests")?.label).toBe("Request Changes");
    for (const path of ["/bookings", "/assistant", "/academic-years", "/admin/review-center"]) expect(paths).not.toContain(path);
  });

  it("prioritizes school-wide monitoring for the Administrator", () => {
    const groups = filterNavForRole("SUPER_ADMINISTRATOR");
    expect(groups[0].label).toBe("School Monitoring");
    expect(groups[0].items.map((item) => item.href)).toEqual(["/dashboard", "/analytics", "/admin/review-center", "/reports", "/workload"]);
    const paths = allowedHrefsForRole("SUPER_ADMINISTRATOR");
    for (const path of ["/bookings", "/admin/departments", "/admin/emergency-access", "/constraints"]) expect(paths).not.toContain(path);
    expect(allowedHrefsForRole("SUPER_ADMINISTRATOR")).toContain("/admin/audit-logs");
  });

  it("limits scheduling constraints to the Registrar and Heads of Department", () => {
    for (const role of ["REGISTRAR", "HEAD_OF_DEPARTMENT"] as const) {
      expect(canAccessPath("/constraints", role)).toBe(true);
      expect(allowedHrefsForRole(role)).toContain("/constraints");
    }
    expect(canAccessPath("/constraints", "SUPER_ADMINISTRATOR")).toBe(false);
    expect(canAccessPath("/constraints", "FACULTY")).toBe(false);
  });

  it("keeps excluded administrative pages with the Registrar, not the Administrator", () => {
    for (const path of ["/admin/departments", "/admin/emergency-access"]) {
      expect(canAccessPath(path, "REGISTRAR")).toBe(true);
      expect(canAccessPath(path, "SUPER_ADMINISTRATOR")).toBe(false);
    }
    expect(canAccessPath("/bookings", "REGISTRAR")).toBe(true);
    expect(canAccessPath("/bookings", "SUPER_ADMINISTRATOR")).toBe(false);
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
    expect(activeHrefFor("/programs/bsit", "REGISTRAR")).toBe("/academic-years");
    expect(activeHrefFor("/subjects/bsit", "HEAD_OF_DEPARTMENT")).toBe("/programs");
    expect(activeHrefFor("/admin/audit-logs", "SUPER_ADMINISTRATOR")).toBe("/admin/audit-logs");
    expect(activeHrefFor("/availability", "FACULTY")).toBe("/availability");
    expect(activeHrefFor("/admin/users", "FACULTY")).toBeUndefined();
  });
});
