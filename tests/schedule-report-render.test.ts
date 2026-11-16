import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReportDoc } from "@/lib/export/report";

const mocks = vi.hoisted(() => ({ report: vi.fn() }));
vi.mock("@/components/ux/export-buttons", () => ({ ReportButtons: ({ doc }: { doc: unknown }) => { mocks.report(doc); return null; } }));

import { ScheduleReportTable } from "@/app/(dashboard)/reports/report-table";

const row = (id: string, status = "PUBLISHED", departmentId = "cs", buildingId = "main") => ({
  id, status, departmentId, buildingId, semesterLabel: "First Semester", semesterId: "term", termStart: "2026-10-01", termEnd: "2026-10-31", subjectLabel: id,
  sectionLabel: "Section 1", sectionId: "section", level: "COLLEGE", facultyLabel: "Teacher", facultyId: "teacher", roomLabel: "Room 1", roomId: "room", dayOfWeek: "MONDAY", startMin: 480, endMin: 540,
});

const props = {
  rows: [row("published"), row("draft", "DRAFT"), row("foreign", "PUBLISHED", "business"), row("annex", "PUBLISHED", "cs", "annex")],
  activities: [], semesters: [{ id: "term", label: "First Semester", start: "2026-10-01", end: "2026-10-31" }],
  departments: [{ id: "cs", label: "Computing" }, { id: "business", label: "Business" }], sections: [{ id: "section", label: "Section 1" }],
  faculty: [{ id: "teacher", label: "Teacher" }], rooms: [{ id: "room", label: "Room 1" }], buildings: [{ id: "main", label: "Main Building" }, { id: "annex", label: "Annex" }],
  activeLevel: "COLLEGE", initialFilters: { term: "term", department: "cs", building: "main", status: "PUBLISHED" },
};

describe("schedule report analytics and exports", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders a focused register and exports matching analytics with the applied scope", () => {
    const html = renderToStaticMarkup(createElement(ScheduleReportTable, props));
    const doc = mocks.report.mock.calls.at(-1)![0] as ReportDoc<ReturnType<typeof row>>;
    expect(doc.rows.map((entry) => entry.id)).toEqual(["published"]);
    expect(doc.term).toContain("Computing · Main Building · Published");
    expect(doc.extra?.[0].rows).toContainEqual({ metric: "Class meetings", value: 1 });
    expect(doc.extra?.[0].rows).toContainEqual({ metric: "Weekly teaching hours (combined weekly patterns)", value: 1 });
    expect(html).toContain("Schedule analytics");
    expect(html).toContain("Schedule register");
    expect(html).not.toContain("Includes unpublished schedules");
  });

  it("includes draft meetings only when explicitly requested and labels the export", () => {
    const html = renderToStaticMarkup(createElement(ScheduleReportTable, { ...props, initialFilters: { ...props.initialFilters, status: "ALL" } }));
    const doc = mocks.report.mock.calls.at(-1)![0] as ReportDoc<ReturnType<typeof row>>;
    expect(doc.rows.map((entry) => entry.id)).toEqual(["published", "draft"]);
    expect(doc.term).toContain("All workflow stages");
    expect(doc.extra?.[0].rows).toContainEqual({ metric: "Published share of selection", value: "50%" });
    expect(html).toContain("Includes unpublished schedules");
  });

});
