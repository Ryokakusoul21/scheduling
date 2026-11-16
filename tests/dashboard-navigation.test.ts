import { describe, expect, it } from "vitest";
import { activeHrefFor, allowedHrefsForRole, filterNavForRole, mobileNavForRole, navMatchesPath, tabsForPath } from "@/components/layout/nav-config";
import { canAccessPath } from "@/lib/permissions/routes";
import { ROLES } from "@/lib/permissions/roles";

describe("role-focused sidebar navigation", () => {
  it("keeps the Registrar's frequent destinations directly available on mobile", () => {
    expect(mobileNavForRole("REGISTRAR").map((item) => item.href)).toEqual(["/dashboard", "/programs", "/admin/review-center", "/calendar"]);
  });

  it("only offers authorized, distinct mobile destinations for each role", () => {
    for (const role of ROLES) {
      const items = mobileNavForRole(role);
      expect(items).toHaveLength(4);
      expect(new Set(items.map((item) => item.href)).size).toBe(4);
      for (const item of items) expect(canAccessPath(item.href, role), `${role}: ${item.href}`).toBe(true);
    }
  });

  it("merges programs and terms into the Registrar's Academic Record workspace", () => {
    const groups = filterNavForRole("REGISTRAR");
    expect(groups[1].label).toBe("Academic Record");
    const tabs = ["/programs", "/subjects", "/sections", "/faculty", "/rooms", "/admin/departments", "/import"];
    const pages = ["/programs", "/academic-years", ...tabs.slice(1)];
    expect(groups[1].direct).toBe(true);
    expect(groups[1].items).toHaveLength(1);
    expect(groups[1].items[0]).toMatchObject({ href: "/programs", label: "Academic Record", match: pages });
    for (const page of pages) {
      expect(tabsForPath(page, "REGISTRAR")?.map((item) => item.href)).toEqual(tabs);
      expect(activeHrefFor(page, "REGISTRAR")).toBe("/programs");
      expect(allowedHrefsForRole("REGISTRAR")).toContain(page);
    }
    for (const path of ["/admin/scheduling-periods", "/admin/emergency-access"]) expect(allowedHrefsForRole("REGISTRAR")).not.toContain(path);
  });

  it.each(["REGISTRAR", "SUPER_ADMINISTRATOR"] as const)("keeps legacy year details under one programs-and-terms tab for %s", (role) => {
    const tabs = tabsForPath("/academic-years/year-1", role)!;
    expect(tabs.filter((tab) => navMatchesPath("/academic-years/year-1", tab))).toHaveLength(1);
    expect(tabs[0]).toMatchObject({ href: "/programs", label: "Programs & Terms" });
    expect(tabs.map((tab) => tab.href)).not.toContain("/academic-years");
    expect(activeHrefFor("/academic-years/year-1", role)).toBe("/programs");
  });

  it("uses the same workspace name without exposing calendar management to Heads", () => {
    const groups = filterNavForRole("HEAD_OF_DEPARTMENT");
    expect(groups[3].label).toBe("Academic Record");
    expect(allowedHrefsForRole("HEAD_OF_DEPARTMENT")).not.toContain("/academic-years");
    expect(canAccessPath("/academic-years", "HEAD_OF_DEPARTMENT")).toBe(false);
  });

  it.each(["SUPER_ADMINISTRATOR", "REGISTRAR"] as const)("places subject assignments in Submission Monitoring for %s", (role) => {
    const groups = filterNavForRole(role);
    const monitoring = groups.flatMap((group) => group.items).find((item) => item.href === "/admin/review-center");
    const records = groups.find((group) => group.label === "Academic Record")!;
    expect(monitoring).toMatchObject({ label: "Submission Monitoring", match: ["/admin/review-center", "/assignment-approvals"] });
    expect(records.items.flatMap((item) => item.match ?? [item.href])).not.toContain("/assignment-approvals");
    expect(tabsForPath("/programs", role)?.map((item) => item.href)).not.toContain("/assignment-approvals");
    expect(activeHrefFor("/assignment-approvals", role)).toBe("/admin/review-center");
    expect(allowedHrefsForRole(role)).toContain("/assignment-approvals");
  });

  it("makes department scheduling and approvals directly accessible to Heads", () => {
    const groups = filterNavForRole("HEAD_OF_DEPARTMENT");
    expect(groups[1].items.map((item) => item.href)).toEqual(["/scheduler", "/calendar", "/bookings", "/suspensions", "/constraints"]);
    expect(groups[2].items.map((item) => item.href)).toEqual(["/requests", "/assignment-approvals", "/adjustments"]);
    expect(groups[3].items[0].match).toContain("/programs");
    expect(groups[2].items.every((item) => !item.match)).toBe(true);
    expect(canAccessPath("/department", "HEAD_OF_DEPARTMENT")).toBe(true);
    expect(canAccessPath("/department", "FACULTY")).toBe(false);
    expect(canAccessPath("/department", "STUDENT")).toBe(false);
    expect(canAccessPath("/assignment-approvals", "HEAD_OF_DEPARTMENT")).toBe(true);
  });

  it("lets Faculty access room bookings alongside change requests and unavailability", () => {
    const paths = allowedHrefsForRole("FACULTY");
    expect(paths).toEqual(["/dashboard", "/scheduler", "/bookings", "/requests", "/availability", "/my-subjects", "/workload", "/calendar"]);
    expect(canAccessPath("/bookings", "FACULTY")).toBe(true);
    expect(activeHrefFor("/bookings", "FACULTY")).toBe("/bookings");
    expect(filterNavForRole("FACULTY").flatMap((g) => g.items).find((item) => item.href === "/requests")?.label).toBe("Request Changes");
    for (const path of ["/assistant", "/academic-years", "/admin/review-center"]) expect(paths).not.toContain(path);
  });

  it("prioritizes school-wide monitoring for the Administrator", () => {
    const groups = filterNavForRole("SUPER_ADMINISTRATOR");
    expect(groups[0].label).toBe("School Monitoring");
    expect(groups[0].items.map((item) => item.href)).toEqual(["/dashboard", "/analytics", "/admin/review-center", "/reports", "/workload"]);
    const paths = allowedHrefsForRole("SUPER_ADMINISTRATOR");
    for (const path of ["/bookings", "/admin/departments", "/constraints"]) expect(paths).not.toContain(path);
    expect(allowedHrefsForRole("SUPER_ADMINISTRATOR")).toContain("/admin/audit-logs");
    expect(paths).toContain("/assignment-approvals");
  });

  it("limits scheduling constraints to the Registrar and Heads of Department", () => {
    for (const role of ["REGISTRAR", "HEAD_OF_DEPARTMENT"] as const) {
      expect(canAccessPath("/constraints", role)).toBe(true);
      expect(allowedHrefsForRole(role)).toContain("/constraints");
    }
    expect(canAccessPath("/constraints", "SUPER_ADMINISTRATOR")).toBe(false);
    expect(canAccessPath("/constraints", "FACULTY")).toBe(false);
  });

  it("limits class suspensions to the Registrar and Heads of Department", () => {
    for (const role of ["REGISTRAR", "HEAD_OF_DEPARTMENT"] as const) {
      expect(canAccessPath("/suspensions", role)).toBe(true);
      expect(allowedHrefsForRole(role)).toContain("/suspensions");
    }
    for (const role of ["SUPER_ADMINISTRATOR", "FACULTY", "STUDENT"] as const) expect(canAccessPath("/suspensions", role)).toBe(false);
  });

  it("keeps excluded administrative pages with the Registrar, not the Administrator", () => {
    expect(canAccessPath("/admin/departments", "REGISTRAR")).toBe(true);
    expect(canAccessPath("/admin/departments", "SUPER_ADMINISTRATOR")).toBe(false);
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
    expect(groups[0].label).toBe("Student workspace");
    expect(groups.flatMap((group) => group.items.map((item) => item.href))).toEqual(["/student", "/student/schedule", "/student/calendar", "/student/profile", "/student/subjects"]);
    expect(groups[0].items.map((item) => item.href)).toEqual(["/student", "/student/schedule", "/student/calendar", "/student/profile"]);
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
