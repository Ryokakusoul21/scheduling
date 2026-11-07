import { prisma } from "@/lib/db/prisma";
import { requireStudent } from "@/lib/auth/session";
import { NotificationsList } from "@/app/(dashboard)/notifications/notifications-list";

export const metadata = { title: "Notifications · GRANBY COLLEGES OF SCIENCE AND TECHNOLOGY" };

/** The signed-in student's own notifications. */
export default async function StudentNotificationsPage() {
  const user = await requireStudent();
  const notifications = await prisma.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 100 });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
        <p className="text-sm text-muted-foreground">Schedule changes, room changes, and announcements for your section.</p>
      </div>
      <NotificationsList
        notifications={notifications.map((n) => ({
          id: n.id,
          type: n.type,
          title: n.title,
          message: n.message,
          isRead: n.isRead,
          // Only links inside the student portal are kept; staff pages would be refused anyway.
          link: n.link?.startsWith("/student") ? n.link : "",
          createdAt: n.createdAt.toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" }),
        }))}
      />
    </div>
  );
}
