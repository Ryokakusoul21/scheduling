import "server-only";
import type { NotificationType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

interface Message {
  title: string;
  message: string;
  link?: string;
  type?: NotificationType;
  departmentId?: string | null;
}

type Client = Prisma.TransactionClient | typeof prisma;

/** Notifies the user accounts linked to the given faculty records. */
export async function notifyFaculty(facultyIds: string[], msg: Message, db: Client = prisma) {
  const ids = [...new Set(facultyIds)];
  if (ids.length === 0) return;
  const users = await db.user.findMany({ where: { facultyId: { in: ids }, status: "ACTIVE", archivedAt: null }, select: { id: true } });
  await notifyUsers(users.map((u) => u.id), msg, db);
}

/** A different message per group of faculty, sent with one user lookup and one insert. */
export async function notifyFacultyEach(items: { facultyIds: string[]; msg: Message }[], db: Client = prisma) {
  const all = [...new Set(items.flatMap((i) => i.facultyIds))];
  if (all.length === 0) return;
  const users = await db.user.findMany({ where: { facultyId: { in: all }, status: "ACTIVE", archivedAt: null }, select: { id: true, facultyId: true } });
  await notifyEach(items.map((i) => ({ userIds: users.filter((u) => u.facultyId && i.facultyIds.includes(u.facultyId)).map((u) => u.id), msg: i.msg })), db);
}

/** A different message per group of users, in a single insert. */
export async function notifyEach(items: { userIds: string[]; msg: Message }[], db: Client = prisma) {
  const data = items.flatMap(({ userIds, msg }) =>
    [...new Set(userIds)].map((userId) => ({ userId, type: msg.type ?? "INFO", title: msg.title, message: msg.message, link: msg.link, departmentId: msg.departmentId }))
  );
  if (data.length) await db.notification.createMany({ data });
}

/** Notifies Registrars and, when a department is given, that department's Head of Department. */
export async function notifyManagers(departmentId: string | null, msg: Message, db: Client = prisma) {
  const now = new Date();
  const users = await db.user.findMany({
    where: {
      status: "ACTIVE",
      archivedAt: null,
      OR: [
        { role: { in: ["SUPER_ADMINISTRATOR", "REGISTRAR"] as ("SUPER_ADMINISTRATOR" | "REGISTRAR")[] } },
        ...(departmentId ? [{
          role: "HEAD_OF_DEPARTMENT" as const,
          OR: [
            { faculty: { departmentId } },
            { departmentAssignments: { some: { departmentId, AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gte: now } }] }] } } },
          ],
        }] : []),
      ],
    },
    select: { id: true },
  });
  await notifyUsers(users.map((u) => u.id), { ...msg, departmentId }, db);
}

export async function notifyUsers(userIds: string[], msg: Message, db: Client = prisma) {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return;
  await db.notification.createMany({
    data: ids.map((userId) => ({ userId, type: msg.type ?? "INFO", title: msg.title, message: msg.message, link: msg.link, departmentId: msg.departmentId })),
  });
}
