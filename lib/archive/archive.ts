import "server-only";
import { prisma } from "@/lib/db/prisma";
import { formatRange } from "@/lib/scheduler/timetable";
import { ARCHIVE_LABELS, type ArchiveKind } from "./kinds";

/** Prisma filter for records still in use; spread into every choice list and new-scheduling query. */
export const NOT_ARCHIVED = { archivedAt: null } as const;

const DAY_LABEL: Record<string, string> = {
  MONDAY: "Monday", TUESDAY: "Tuesday", WEDNESDAY: "Wednesday", THURSDAY: "Thursday", FRIDAY: "Friday", SATURDAY: "Saturday", SUNDAY: "Sunday",
};

/** Classes in the active terms that still use the record, listed so the Administrator can decide before archiving. */
export async function activeClassesOf(kind: ArchiveKind, id: string) {
  const facultyId = kind === "USER" ? (await prisma.user.findUnique({ where: { id }, select: { facultyId: true } }))?.facultyId : id;
  const field = { USER: "facultyId", FACULTY: "facultyId", SUBJECT: "subjectId", ROOM: "roomId", SECTION: "sectionId" }[kind];
  const value = kind === "USER" || kind === "FACULTY" ? facultyId : id;
  if (!value) return [];
  const rows = await prisma.schedule.findMany({
    where: { [field]: value, status: { not: "ARCHIVED" }, semester: { isActive: true } },
    include: { subject: { select: { code: true } }, section: { select: { name: true } }, room: { select: { roomName: true } } },
    orderBy: [{ dayOfWeek: "asc" }, { startMin: "asc" }],
  });
  return rows.map((s) => `${s.subject.code} ${s.section.name}, ${DAY_LABEL[s.dayOfWeek]} ${formatRange(s.startMin, s.endMin)}, ${s.room.roomName}`);
}

/**
 * Archives or restores one record and writes the audit log. A faculty user account and its faculty
 * record move together, so an archived person can neither sign in nor be scheduled.
 */
export async function setArchived(kind: ArchiveKind, id: string, actorId: string, archive: boolean, reason?: string | null) {
  const data = archive
    ? { archivedAt: new Date(), archivedById: actorId, archiveReason: reason?.trim() || null }
    : { archivedAt: null, archivedById: null, archiveReason: null };

  const name = await prisma.$transaction(async (tx) => {
    switch (kind) {
      case "USER": {
        // Bumping sessionVersion ends every open session of an archived account.
        const user = await tx.user.update({ where: { id }, data: { ...data, ...(archive ? { sessionVersion: { increment: 1 } } : {}) } });
        if (user.facultyId) await tx.faculty.update({ where: { id: user.facultyId }, data });
        return user.name;
      }
      case "FACULTY": {
        const faculty = await tx.faculty.update({ where: { id }, data });
        await tx.user.updateMany({ where: { facultyId: id }, data: { ...data, ...(archive ? { sessionVersion: { increment: 1 } } : {}) } });
        return faculty.fullName;
      }
      case "SUBJECT":
        return (await tx.subject.update({ where: { id }, data })).code;
      case "ROOM":
        return (await tx.room.update({ where: { id }, data })).roomName;
      case "SECTION":
        return (await tx.section.update({ where: { id }, data })).name;
    }
  });

  await prisma.auditLog.create({
    data: {
      userId: actorId,
      action: `${archive ? "Archived" : "Restored"} ${ARCHIVE_LABELS[kind].toLowerCase()} "${name}"`,
      entity: ARCHIVE_LABELS[kind],
      entityId: id,
      newValue: archive ? { reason: data.archiveReason } : undefined,
    },
  });
  return name;
}
