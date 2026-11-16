import { requireUser } from "@/lib/auth/session";
import { loadNotifications } from "@/lib/notifications/service";
import { NotificationsList } from "@/app/(dashboard)/notifications/notifications-list";

export const metadata = { title: "Notifications · GRANBY COLLEGES OF SCIENCE AND TECHNOLOGY" };

export default async function NotificationsPage() {
  const user = await requireUser();
  const initialPage = await loadNotifications(user);
  return <NotificationsList initialPage={initialPage} userId={user.id} initialNow={new Date().toISOString()} />;
}
