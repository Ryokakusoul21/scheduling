import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { SubjectCalendar } from "@/lib/subjects/terms";

vi.mock("@/components/ui/dialog", () => {
  const Wrap = ({ children }: { children: ReactNode }) => createElement("div", null, children);
  return { Dialog: Wrap, DialogContent: Wrap, DialogDescription: Wrap, DialogFooter: Wrap, DialogHeader: Wrap, DialogTitle: Wrap };
});
import { SubjectFormDialog } from "@/app/(dashboard)/subjects/subject-form-dialog";
import { LevelFlow } from "@/components/academics/level-flow";

const calendar: SubjectCalendar = { id: "ay", name: "2026-2027", isActive: true, semesters: [
  { id: "first", name: "First Semester", type: "FIRST", programId: null, isActive: false },
  { id: "second", name: "Second Semester", type: "SECOND", programId: null, isActive: true },
  { id: "own", name: "BSCS First Semester", type: "FIRST", programId: "bscs", isActive: true },
] };
function form(programId = "bsit", editing = false, semester?: string, source: SubjectCalendar | null = calendar) {
  return renderToStaticMarkup(createElement(SubjectFormDialog, {
    open: true, onOpenChange: vi.fn(), onSubmit: vi.fn(), calendar: source, editing, title: "Subject",
    fields: [{ name: "programId", label: "", type: "hidden" }, { name: "semester", label: "Semester", type: "select" }],
    values: { level: "COLLEGE", programId, semester },
  }));
}
describe("calendar-backed subject forms", () => {
  it("renders configured semesters and defaults to the active term", () => {
    const html = form();
    expect(html).toContain('value="FIRST"');
    expect(html).toMatch(/value="SECOND"[^>]*selected=""/);
    expect(html).not.toContain('value="SUMMER"');
    expect(html).not.toContain("Midyear");
    expect(html).toContain('name="academicYearId" value="ay"');
    expect(html).toContain("Academic Years and Terms · 2026-2027");
  });
  it("renders only the course-specific calendar when one exists", () => {
    const html = form("bscs");
    expect(html).toContain("BSCS First Semester");
    expect(html).not.toContain('value="SECOND"');
  });
  it("uses the explicitly selected semester when adding to a selected term", () => {
    expect(form("bsit", false, "FIRST")).toMatch(/value="FIRST"[^>]*selected=""/);
  });
  it("preserves an old unconfigured choice visibly rather than silently replacing it", () => {
    const html = form("bsit", true, "SUMMER");
    expect(html).toMatch(/value="SUMMER"[^>]*disabled=""[^>]*selected=""/);
    expect(html).toContain("Summer (not configured)");
  });
  it("explains where to configure missing semesters", () => {
    expect(form("bsit", false, undefined, null)).toContain("No semesters configured. Set them up in Academic Years and Terms first.");
  });
  it("keeps the selected academic year while drilling into a course and year level", () => {
    const html = renderToStaticMarkup(createElement(LevelFlow, {
      basePath: "/subjects", rootLabel: "Subjects", noun: "subjects", queryParams: { ay: "older-year" },
      flow: { level: "COLLEGE", programId: "bsit", year: null, grade: null, strand: null },
      rows: [], programs: [{ id: "bsit", code: "BSIT", name: "Information Technology", level: "COLLEGE" }],
    }));
    expect(html).toContain("year=FIRST&amp;ay=older-year");
    expect(html).toContain('href="/subjects?ay=older-year"');
  });
});
