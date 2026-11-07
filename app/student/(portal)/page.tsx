import { loadStudentPortal } from "@/lib/student/portal";
import { NoSectionState } from "@/components/student/page-header";
import { StudentOverview } from "@/components/student/overview";
import { NoticeBanner } from "@/components/student/notice-banner";
import { MovedList } from "@/components/student/moves";
import { EmptyState } from "@/components/ux/states";

export const metadata = { title: "Student Dashboard · GRANBY COLLEGES OF SCIENCE AND TECHNOLOGY" };

/** Student dashboard: notices, greeting, summary cards, and today's classes. */
export default async function StudentDashboardPage() {
  const portal = await loadStudentPortal();
  if (!portal.section) return <NoSectionState />;

  return (
    <div className="space-y-4">
      <NoticeBanner activities={portal.activities} />
      <MovedList moves={portal.moves} />
      <StudentOverview firstName={portal.user.name.split(" ")[0] || "there"} term={portal.term} classes={portal.classes} activities={portal.activities} />
      {portal.classes.length === 0 && (
        <EmptyState title="Schedule not published yet" description={`Section ${portal.section.name} has no published classes. Your timetable appears here once it is published.`} />
      )}
    </div>
  );
}
