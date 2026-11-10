import { loadStudentPortal } from "@/lib/student/portal";
import { NoSectionState } from "@/components/student/page-header";
import { StudentLanding } from "@/components/student/landing";

export const metadata = { title: "Student Dashboard · GRANBY COLLEGES OF SCIENCE AND TECHNOLOGY" };

/** Student dashboard: notices, greeting, summary cards, and today's classes. */
export default async function StudentDashboardPage() {
  const portal = await loadStudentPortal();
  if (!portal.section) return <NoSectionState />;

  return <StudentLanding firstName={portal.user.name.split(" ")[0] || "there"} term={portal.term} section={portal.section} classes={portal.classes} activities={portal.activities} moves={portal.moves} />;
}
