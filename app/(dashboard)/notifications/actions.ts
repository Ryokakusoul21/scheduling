"use server";

import { revalidatePath } from "next/cache";
import { requireAccount } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { notificationVisibility } from "@/lib/permissions/notifications";
import { loadNotifications } from "@/lib/notifications/service";

/** The account's latest notifications for the topbar popup. */
export async function listRecentNotificationsAction() {
  const user = await requireAccount();
  return (await loadNotifications(user, { limit: 15 })).items;
}

export async function markNotificationReadAction(id: string) {
  const user = await requireAccount();
  await prisma.notification.updateMany({ where: { id, userId: user.id, ...notificationVisibility(user.role) }, data: { isRead: true } });
  revalidatePath("/notifications");
  revalidatePath("/student/notifications");
  return { ok: true };
}

export async function markAllNotificationsReadAction() {
  const user = await requireAccount();
  await prisma.notification.updateMany({ where: { userId: user.id, isRead: false, ...notificationVisibility(user.role) }, data: { isRead: true } });
  revalidatePath("/notifications");
  revalidatePath("/student/notifications");
  return { ok: true };
}
