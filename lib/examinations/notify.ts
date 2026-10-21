import "server-only";
import type { ExaminationType, NotificationType } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { notifyUsers } from "@/lib/notify";
import { formatRange } from "@/lib/scheduler/timetable";
import { formatLongDate } from "@/lib/calendar";

export type ExamNotice = "SCHEDULED" | "UPDATED" | "CANCELLED" | "REMINDER";

export interface ExamDetails {
  sectionId: string;
  subjectId: string;
  roomId: string;
  proctorId: string;
  type: ExaminationType;
  date: string;
  startMin: number;
  endMin: number;
}

const TYPE_WORD: Record<ExaminationType, string> = { PRELIMINARY: "preliminary", MIDTERM: "midterm", FINAL: "final", SPECIAL: "special" };

/** Titles used for examination notifications (also how dashboards recognize them). */
export const EXAM_TITLES = {
  proctor: { SCHEDULED: "New proctoring assignment", UPDATED: "Proctoring assignment updated", CANCELLED: "Proctoring assignment cancelled", REMINDER: "Proctoring reminder" },
  instructor: { SCHEDULED: "Examination scheduled for your class", UPDATED: "Examination changed for your class", CANCELLED: "Examination cancelled for your class", REMINDER: "Examination reminder for your class" },
  head: { SCHEDULED: "Department examination scheduled", UPDATED: "Department examination changed", CANCELLED: "Department examination cancelled", REMINDER: "Department examination reminder" },
  removed: "Proctoring assignment removed",
} as const;

async function usersOf(facultyIds: string[]) {
  if (!facultyIds.length) return [];
  return (await prisma.user.findMany({ where: { facultyId: { in: facultyIds }, status: "ACTIVE", archivedAt: null }, select: { id: true } })).map((u) => u.id);
}

/**
 * Notifies everyone who has the examination on their schedule: the proctor, the faculty teaching that
 * subject to that section, and the department's Head of Department. The person making the change is skipped.
 * Returns how many people were notified.
 */
export async function notifyExamParticipants(exam: ExamDetails, notice: ExamNotice, opts: { actorUserId?: string; previousProctorId?: string } = {}) {
  const [subject, section, room, proctor, teaching] = await Promise.all([
    prisma.subject.findUnique({ where: { id: exam.subjectId }, select: { code: true, name: true } }),
    prisma.section.findUnique({ where: { id: exam.sectionId }, select: { name: true, program: { select: { departmentId: true } } } }),
    prisma.room.findUnique({ where: { id: exam.roomId }, select: { roomName: true } }),
    prisma.faculty.findUnique({ where: { id: exam.proctorId }, select: { fullName: true } }),
    prisma.schedule.findMany({
      where: { sectionId: exam.sectionId, subjectId: exam.subjectId, status: { not: "ARCHIVED" }, semester: { isActive: true } },
      select: { facultyId: true },
      distinct: ["facultyId"],
    }),
  ]);
  const what = `${subject?.code} ${subject?.name} ${TYPE_WORD[exam.type]} examination of ${section?.name}`;
  const when = `${formatLongDate(exam.date)}, ${formatRange(exam.startMin, exam.endMin)} in ${room?.roomName}`;
  const verb = notice === "CANCELLED" ? "was cancelled. It was set for" : notice === "UPDATED" ? "now takes place on" : "is on";
  const type: NotificationType = notice === "CANCELLED" ? "WARNING" : "INFO";

  const sent = new Set<string>(opts.actorUserId ? [opts.actorUserId] : []);
  const send = async (userIds: string[], title: string, message: string) => {
    const fresh = userIds.filter((id) => !sent.has(id));
    fresh.forEach((id) => sent.add(id));
    await notifyUsers(fresh, { title, message, link: "/examinations", type });
  };
  const before = sent.size;

  await send(await usersOf([exam.proctorId]), EXAM_TITLES.proctor[notice], `You ${notice === "CANCELLED" ? "no longer need to proctor" : "proctor"} the ${what}. It ${verb} ${when}.`);
  if (opts.previousProctorId && opts.previousProctorId !== exam.proctorId) {
    await send(await usersOf([opts.previousProctorId]), EXAM_TITLES.removed, `You no longer proctor the ${what}; ${proctor?.fullName ?? "another faculty member"} does now.`);
  }
  const instructors = teaching.map((t) => t.facultyId).filter((id) => id !== exam.proctorId);
  await send(await usersOf(instructors), EXAM_TITLES.instructor[notice], `The ${what} ${verb} ${when}. Proctor: ${proctor?.fullName ?? "to be assigned"}.`);
  const departmentId = section?.program?.departmentId;
  if (departmentId) {
    const heads = await prisma.user.findMany({ where: { role: "HEAD_OF_DEPARTMENT", status: "ACTIVE", archivedAt: null, faculty: { departmentId } }, select: { id: true } });
    await send(heads.map((h) => h.id), EXAM_TITLES.head[notice], `The ${what} ${verb} ${when}. Proctor: ${proctor?.fullName ?? "to be assigned"}.`);
  }
  return sent.size - before;
}
