import { listActivities, visibleActivities } from "@/lib/activities/activities";
import { DashboardActivityCalendar } from "./activity-calendar";

/** The dashboard shows official activities within the same access boundaries as the full calendar. */
export async function DashboardActivities({ scope, today, href }: {
  scope: Parameters<typeof visibleActivities>[0];
  today: string;
  href?: string;
}) {
  const activities = await listActivities({ AND: [visibleActivities(scope), { status: "APPROVED" }] });
  return <DashboardActivityCalendar today={today} href={href} activities={activities.map((activity) => ({
    id: activity.id,
    title: activity.title,
    type: activity.type,
    startDate: activity.startDate,
    endDate: activity.endDate,
    startMin: activity.startMin,
    endMin: activity.endMin,
    location: activity.location,
  }))} />;
}
