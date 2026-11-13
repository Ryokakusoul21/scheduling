import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { notificationVisibility } from "@/lib/permissions/notifications";
import { canAccessPath } from "@/lib/permissions/routes";
import type { AppRole } from "@/lib/permissions/roles";
import { notificationSummary, type NotificationPage } from "./format";

export function decodeNotificationCursor(value: string) {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (typeof parsed.id !== "string" || !parsed.id || typeof parsed.createdAt !== "string") return null;
    const createdAt = new Date(parsed.createdAt);
    return Number.isNaN(createdAt.getTime()) ? null : { id: parsed.id, createdAt };
  } catch { return null; }
}

export async function loadNotifications(
  user: { id: string; role: string },
  options: { unreadOnly?: boolean; cursor?: string; limit?: number } = {},
): Promise<NotificationPage> {
  const visible: Prisma.NotificationWhereInput = { userId: user.id, ...notificationVisibility(user.role) };
  const cursor = options.cursor ? decodeNotificationCursor(options.cursor) : null;
  if (options.cursor && !cursor) throw new Error("Invalid notification cursor");
  const limit = Math.max(1, Math.min(options.limit ?? 25, 50));
  const [rows, unread] = await Promise.all([
    prisma.notification.findMany({
      where: { AND: [visible, options.unreadOnly ? { isRead: false } : {}, cursor ? {
        OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }],
      } : {}] },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    }),
    prisma.notification.count({ where: { ...visible, isRead: false } }),
  ]);
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return {
    items: page.map((n) => {
      const message = notificationSummary(n.message);
      const link = n.link?.startsWith("/") && !n.link.startsWith("//") && !/[\\\u0000-\u001f\u007f]/.test(n.link)
        && canAccessPath(n.link.split(/[?#]/)[0], user.role as AppRole) ? n.link : "";
      return {
        id: n.id, type: n.type, title: notificationSummary(n.title, 72), message,
        fullMessage: message !== n.message.replace(/\s+/g, " ").trim() ? n.message : null,
        isRead: n.isRead, link, createdAt: n.createdAt.toISOString(),
      };
    }),
    unread,
    nextCursor: rows.length > limit && last
      ? Buffer.from(JSON.stringify({ id: last.id, createdAt: last.createdAt.toISOString() })).toString("base64url") : null,
  };
}
