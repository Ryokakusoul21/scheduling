import { loadStudentPortal } from "@/lib/student/portal";
import { NoSectionState } from "@/components/student/page-header";
import { StudentLanding } from "@/components/student/landing";
import { DashboardActivities } from "@/components/dashboard/activities";

export const metadata = { title: "Student Dashboard · GRANBY COLLEGES OF SCIENCE AND TECHNOLOGY" };

/** Student dashboard: notices, greeting, summary cards, and today's classes. */
export default async function StudentDashboardPage() {
  const portal = await loadStudentPortal();
  if (!portal.section) return <div className="space-y-5"><NoSectionState /><DashboardActivities scope={{ role: "STUDENT", isAdmin: false, departmentId: null }} today={new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" })} href="/student/calendar" /></div>;

  return <StudentLanding firstName={portal.user.name.split(" ")[0] || "there"} term={portal.term} section={portal.section} classes={portal.classes} activities={portal.activities} moves={portal.moves} />;
}
