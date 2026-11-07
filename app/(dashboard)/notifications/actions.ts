"use server";

import { revalidatePath } from "next/cache";
import { requireAccount } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

export async function markNotificationReadAction(id: string) {
  const user = await requireAccount();
  await prisma.notification.updateMany({ where: { id, userId: user.id }, data: { isRead: true } });
  revalidatePath("/notifications");
  revalidatePath("/student/notifications");
  return { ok: true };
}

export async function markAllNotificationsReadAction() {
  const user = await requireAccount();
  await prisma.notification.updateMany({ where: { userId: user.id, isRead: false }, data: { isRead: true } });
  revalidatePath("/notifications");
  revalidatePath("/student/notifications");
  return { ok: true };
}
