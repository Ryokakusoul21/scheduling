import "server-only";
import type { NotificationType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

interface Message {
  title: string;
  message: string;
  link?: string;
  type?: NotificationType;
}

type Client = Prisma.TransactionClient | typeof prisma;

/** Notifies the user accounts linked to the given faculty records. */
export async function notifyFaculty(facultyIds: string[], msg: Message, db: Client = prisma) {
  const ids = [...new Set(facultyIds)];
  if (ids.length === 0) return;
  const users = await db.user.findMany({ where: { facultyId: { in: ids }, status: "ACTIVE" }, select: { id: true } });
  await notifyUsers(users.map((u) => u.id), msg, db);
}

/** Notifies Administrators and, when a department is given, that department's Head of Department. */
export async function notifyManagers(departmentId: string | null, msg: Message, db: Client = prisma) {
  const users = await db.user.findMany({
    where: {
      status: "ACTIVE",
      OR: [
        { role: "ADMINISTRATOR" },
        ...(departmentId ? [{ role: "HEAD_OF_DEPARTMENT" as const, faculty: { departmentId } }] : []),
      ],
    },
    select: { id: true },
  });
  await notifyUsers(users.map((u) => u.id), msg, db);
}

export async function notifyUsers(userIds: string[], msg: Message, db: Client = prisma) {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return;
  await db.notification.createMany({
    data: ids.map((userId) => ({ userId, type: msg.type ?? "INFO", title: msg.title, message: msg.message, link: msg.link })),
  });
}
