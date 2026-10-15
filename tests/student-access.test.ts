import { describe, expect, it } from "vitest";
import { canAccessPath } from "@/lib/permissions/routes";
import { isPublicPath } from "@/auth.config";
import { homePath } from "@/lib/permissions/roles";
import { reportHtml, timetableDoc } from "@/lib/export/report";

describe("student access", () => {
  it("keeps students inside the student portal", () => {
    expect(canAccessPath("/student", "STUDENT")).toBe(true);
    for (const path of ["/dashboard", "/scheduler", "/calendar", "/bookings", "/rooms", "/profile", "/notifications"]) {
      expect(canAccessPath(path, "STUDENT")).toBe(false);
    }
  });

  it("keeps staff out of the student portal", () => {
    for (const role of ["ADMINISTRATOR", "HEAD_OF_DEPARTMENT", "FACULTY"] as const) {
      expect(canAccessPath("/student", role)).toBe(false);
      expect(canAccessPath("/scheduler", role)).toBe(true);
    }
  });

  it("serves the student authentication pages without a session and keeps staff pages public", () => {
    for (const path of ["/student/login", "/student/register", "/student/forgot-password", "/student/reset-password", "/login", "/register"]) {
      expect(isPublicPath(path)).toBe(true);
    }
    expect(isPublicPath("/student")).toBe(false);
  });

  it("sends each role to its own home page", () => {
    expect(homePath("STUDENT")).toBe("/student");
    expect(homePath("FACULTY")).toBe("/dashboard");
  });
});

describe("printable reports", () => {
  const doc = timetableDoc(
    "Class Timetable: STEM 11-A",
    "2026-2027 · First Semester",
    [
      { dayOfWeek: "TUESDAY", startMin: 480, endMin: 540, subject: "B", component: "LECTURE", section: "STEM 11-A", faculty: "Ana", room: "101" },
      { dayOfWeek: "MONDAY", startMin: 600, endMin: 660, subject: "<script>", component: "LABORATORY", section: "STEM 11-A", faculty: "Ana", room: "101" },
    ],
    "class-timetable"
  );

  it("includes the institution header, term, and landscape orientation", () => {
    const html = reportHtml(doc);
    expect(html).toContain("GRANBY COLLEGES OF SCIENCE &#38; TECHNOLOGY");
    expect(html).toContain("2026-2027 · First Semester");
    expect(html).toContain("Date Generated:");
    expect(html).toContain("A4 landscape");
    expect(html).toContain("break-inside: avoid");
  });

  it("escapes cell text and sorts by day then time", () => {
    const html = reportHtml(doc);
    expect(html).not.toContain("<script>");
    expect(doc.rows.map((r) => r.dayOfWeek)).toEqual(["MONDAY", "TUESDAY"]);
  });
});
