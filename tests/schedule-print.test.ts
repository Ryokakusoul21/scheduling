import { describe, expect, it } from "vitest";
import { scheduleSheetsHtml } from "@/components/scheduler/schedule-sheet";
import { reportHtml, timetableDoc } from "@/lib/export/report";
import { scheduleSheetFixture } from "./fixtures/schedule-sheet";

describe("single-page schedule documents", () => {
  it("keeps the last time slot and every legend row inside each section's page", () => {
    const source = scheduleSheetFixture(30);
    const html = scheduleSheetsHtml([source, { ...source, section: { ...source.section, id: "section-b", name: "BSCS 1-B" } }], "Class schedules");
    expect(html.match(/class="sheet"/g)).toHaveLength(2);
    expect(html.match(/class="sheet-content"/g)).toHaveLength(2);
    expect(html.match(/<th>TIME<\/th>/g)).toHaveLength(2);
    expect(html).not.toContain('colspan="2">TIME');
    expect(html).toContain("6:30 PM – 7:00 PM");
    expect(html).toContain("CC030");
    expect(html).toContain("Ana Santos");
    expect(html).toContain("size:A4 landscape;margin:8mm");
  });

  it("uses the same compact single-column timetable for report exports, including exact off-grid times", () => {
    const html = reportHtml(timetableDoc("Faculty schedule", "First Semester", [{
      dayOfWeek: "MONDAY", startMin: 425, endMin: 472, subject: "CC101 - Introduction to Computing", component: "LECTURE", section: "BSCS 1-A", faculty: "Ana Santos", room: "GA-303", units: 3,
    }], "faculty", { focus: "faculty", focusName: "Ana Santos" }));
    expect(html).toContain('<col class="time-column">');
    expect(html).toContain("7:05 AM – 7:30 AM");
    expect(html).toContain("7:30 AM – 7:52 AM");
    expect(html).not.toContain('colspan="2">TIME');
    expect(html).toContain("CC101");
    expect(html).toContain("INSTRUCTOR/S");
  });

  it("escapes schedule names when generating the standalone print document", () => {
    const source = scheduleSheetFixture();
    source.departmentName = '<img src=x onerror="alert(1)">';
    const html = scheduleSheetsHtml([source], "Schedule <review>");
    expect(html).not.toContain(source.departmentName);
    expect(html).toContain("&lt;img");
    expect(html).toContain("Schedule &lt;review&gt;");
  });
});
