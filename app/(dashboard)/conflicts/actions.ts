"use server";

import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { findResolutionOptions } from "@/lib/scheduler/autoResolver";
import { toSchedEntry, toSchedFaculty, toSchedRoom, toSchedSubject } from "@/lib/scheduler/mappers";
import type { DayOfWeek } from "@/lib/scheduler/types";

const STAFF = ["SUPER_ADMIN", "ADMINISTRATOR", "REGISTRAR", "SCHEDULER"] as const;

export async function findFixOptionsAction(scheduleId: string) {
  await requireRole(...STAFF);

  const schedule = await prisma.schedule.findUniqueOrThrow({
    where: { id: scheduleId },
    include: { faculty: { include: { availability: true } }, subject: true, section: true },
  });
  const [rooms, otherSchedules] = await Promise.all([
    prisma.room.findMany({ where: { status: "AVAILABLE" }, include: { availability: true } }),
    prisma.schedule.findMany({ where: { id: { not: scheduleId }, semesterId: schedule.semesterId, status: { not: "ARCHIVED" } } }),
  ]);

  const options = findResolutionOptions(
    toSchedEntry(schedule),
    {
      faculty: toSchedFaculty(schedule.faculty),
      subject: toSchedSubject(schedule.subject),
      sectionStudentCount: schedule.section.studentCount,
      roomPool: rooms.map(toSchedRoom),
      otherEntries: otherSchedules.map(toSchedEntry),
    },
    3
  );

  return { ok: true as const, options };
}

export async function applyResolutionAction(
  scheduleId: string,
  roomId: string,
  dayOfWeek: DayOfWeek,
  startMin: number,
  endMin: number
) {
  const user = await requireRole(...STAFF);
  await prisma.schedule.update({
    where: { id: scheduleId },
    data: { roomId, dayOfWeek, startMin, endMin },
  });
  await prisma.auditLog.create({
    data: { userId: user.id, action: "Applied conflict resolution", entity: "Schedule", entityId: scheduleId },
  });
  return { ok: true as const };
}
