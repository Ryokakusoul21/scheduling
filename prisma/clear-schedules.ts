import type { PrismaClient } from "@prisma/client";

// Removes every class schedule and the records tied to them, so timetables start empty.
export async function clearSchedules(db: PrismaClient) {
  await db.scheduleRequest.deleteMany({ where: { scheduleId: { not: null } } });
  await db.scheduleAdjustment.deleteMany({});
  await db.schedule.deleteMany({});
  await db.subjectAssignment.deleteMany({});
  await db.timetableSubmission.deleteMany({});
}
