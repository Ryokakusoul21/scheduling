import { loadStudentPortal } from "@/lib/student/portal";
import { ActivitiesReportButtons } from "@/components/ux/export-buttons";
import { NoSectionState, StudentPageHeader } from "@/components/student/page-header";
import { StudentActivityCalendar } from "@/components/student/activity-calendar";

export const metadata = { title: "Calendar of Activities · GRANBY COLLEGES OF SCIENCE AND TECHNOLOGY" };

export default async function StudentCalendarPage() {
  const portal = await loadStudentPortal();
  if (!portal.section) return <NoSectionState />;
  const section = portal.section.name;
  return <div className="space-y-6">
    <StudentPageHeader title="Calendar of activities" description="Make room for campus life. Explore school events, holidays, exams, and changes to class days." portal={portal}
      actions={<ActivitiesReportButtons title={`School Activities: ${section}`} term={portal.term} rows={portal.activities} filename={`school-activities-${section.replace(/\W+/g, "-").toLowerCase()}`} official department={portal.section.program ?? "All Departments"} />} />
    <StudentActivityCalendar activities={portal.activities} />
  </div>;
}
