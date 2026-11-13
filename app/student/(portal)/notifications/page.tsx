import { requireStudent } from "@/lib/auth/session";
import { loadNotifications } from "@/lib/notifications/service";
import { NotificationsList } from "@/app/(dashboard)/notifications/notifications-list";

export const metadata = { title: "Notifications · GRANBY COLLEGES OF SCIENCE AND TECHNOLOGY" };

export default async function NotificationsPage() {
  const user = await requireStudent();
  const initialPage = await loadNotifications(user);
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
        <p className="text-sm text-muted-foreground">Updates and announcements for your section.</p>
      </div>
      <NotificationsList initialPage={initialPage} userId={user.id} />
    </div>
  );
}
