import { loadStudentPortal } from "@/lib/student/portal";
import { DAY_ENUMS } from "@/lib/student/schedule";
import { TimetableReportButtons } from "@/components/ux/export-buttons";
import { NoSectionState, StudentPageHeader } from "@/components/student/page-header";
import { StudentTimetable } from "@/components/student/timetable";

export const metadata = { title: "My Schedule · GRANBY COLLEGES OF SCIENCE AND TECHNOLOGY" };

/** The student's own section timetable as a weekly grid, day agenda, or grouped list. */
export default async function StudentSchedulePage() {
  const portal = await loadStudentPortal();
  if (!portal.section) return <NoSectionState />;
  const section = portal.section.name;
  const rows = portal.classes
    .map((c) => ({ dayOfWeek: c.dayOfWeek, startMin: c.startMin, endMin: c.endMin, subject: `${c.subjectCode} - ${c.subjectName}`, component: c.component, section, faculty: c.faculty, room: c.room ?? "To be announced", units: c.units }))
    .sort((a, b) => DAY_ENUMS.indexOf(a.dayOfWeek) - DAY_ENUMS.indexOf(b.dayOfWeek) || a.startMin - b.startMin);

  return (
    <div className="space-y-4">
      <StudentPageHeader
        title="My Schedule"
        portal={portal}
        actions={<TimetableReportButtons title={`Class Timetable: ${section}`} term={portal.term} rows={rows} filename={`class-timetable-${section.replace(/\W+/g, "-").toLowerCase()}`} details={{ course: portal.section.program, year: portal.section.stage, section }} />}
      />
      <StudentTimetable classes={portal.classes} activities={portal.activities} moves={portal.moves} />
    </div>
  );
}
