import { roomLabel } from "@/lib/rooms/label";
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { formatRange } from "@/lib/scheduler/timetable";
import { ARCHIVE_LABELS, type ArchiveKind } from "./kinds";
import { assertSingleDepartmentHead, lockDepartmentHeads } from "@/lib/departments/head-guard";

/** Prisma filter for records still in use; spread into every choice list and new-scheduling query. */
export const NOT_ARCHIVED = { archivedAt: null } as const;

const DAY_LABEL: Record<string, string> = {
  MONDAY: "Monday", TUESDAY: "Tuesday", WEDNESDAY: "Wednesday", THURSDAY: "Thursday", FRIDAY: "Friday", SATURDAY: "Saturday", SUNDAY: "Sunday",
};

/** Classes in the active terms that still use the record, listed so the Registrar can decide before archiving. */
export async function activeClassesOf(kind: ArchiveKind, id: string) {
  const facultyId = kind === "USER" ? (await prisma.user.findUnique({ where: { id }, select: { facultyId: true } }))?.facultyId : id;
  const field = { USER: "facultyId", FACULTY: "facultyId", SUBJECT: "subjectId", ROOM: "roomId", SECTION: "sectionId" }[kind];
  const value = kind === "USER" || kind === "FACULTY" ? facultyId : id;
  if (!value) return [];
  const rows = await prisma.schedule.findMany({
    where: { [field]: value, status: { not: "ARCHIVED" }, semester: { isActive: true } },
    include: { subject: { select: { code: true } }, section: { select: { name: true } }, room: { select: { roomNumber: true, roomName: true } } },
    orderBy: [{ dayOfWeek: "asc" }, { startMin: "asc" }],
  });
  return rows.map((s) => `${s.subject.code} ${s.section.name}, ${DAY_LABEL[s.dayOfWeek]} ${formatRange(s.startMin, s.endMin)}, ${(roomLabel(s.room) || "Online (live)")}`);
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
    if (kind === "USER" || kind === "FACULTY") await lockDepartmentHeads(tx);
    switch (kind) {
      case "USER": {
        // Bumping sessionVersion ends every open session of an archived account.
        const user = await tx.user.update({ where: { id }, data: { ...data, ...(archive ? { sessionVersion: { increment: 1 } } : {}) } });
        if (user.facultyId) await tx.faculty.update({ where: { id: user.facultyId }, data });
        if (!archive) await assertSingleDepartmentHead(tx, user.id);
        return user.name;
      }
      case "FACULTY": {
        const faculty = await tx.faculty.update({ where: { id }, data });
        await tx.user.updateMany({ where: { facultyId: id }, data: { ...data, ...(archive ? { sessionVersion: { increment: 1 } } : {}) } });
        if (!archive) {
          const user = await tx.user.findUnique({ where: { facultyId: id }, select: { id: true } });
          if (user) await assertSingleDepartmentHead(tx, user.id);
        }
        return faculty.fullName;
      }
      case "SUBJECT":
        return (await tx.subject.update({ where: { id }, data })).code;
      case "ROOM":
        return roomLabel(await tx.room.update({ where: { id }, data }));
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
