import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { NotificationsList } from "./notifications-list";

export const metadata = { title: "Notifications · GCST Scheduling" };

export default async function NotificationsPage() {
  const user = await requireUser();
  const notifications = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
        <p className="text-sm text-muted-foreground">System and scheduling notifications for your account.</p>
      </div>

      <NotificationsList
        notifications={notifications.map((n) => ({
          id: n.id,
          type: n.type,
          title: n.title,
          message: n.message,
          isRead: n.isRead,
          link: n.link ?? "",
          createdAt: n.createdAt.toLocaleString(),
        }))}
      />
    </div>
  );
}
