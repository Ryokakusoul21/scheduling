/**
 * Sample urgent room override: an accreditation visit booked by the College of Computer Studies Head takes a
 * room from one college class next week; the class moves to a free room and its faculty member has yet to
 * acknowledge. Runs after the main seed and skips itself when an urgent booking already exists.
 */
import type { PrismaClient } from "@prisma/client";

const JS_DAYS = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];

export async function addBookingSamples(db: PrismaClient) {
  if (await db.roomBooking.count({ where: { priority: { in: ["URGENT", "CRITICAL"] } } })) return;
  const liza = await db.user.findUnique({ where: { email: "head.computing@granby.edu.ph" }, select: { id: true, faculty: { select: { departmentId: true } } } });
  if (!liza?.faculty?.departmentId) return;
  const departmentId = liza.faculty.departmentId;

  // A published class of Liza's department in an active term, on a weekday two to eight days from now.
  const classes = await db.schedule.findMany({
    where: { status: "PUBLISHED", semester: { isActive: true }, section: { departmentId }, room: { departmentId: { in: [departmentId] } }, dayOfWeek: { notIn: ["SATURDAY", "SUNDAY"] } },
    include: { room: true, section: { select: { studentCount: true } }, semester: { select: { endDate: true } } },
    orderBy: [{ startMin: "asc" }],
    take: 40,
  });
  for (const c of classes) {
    const date = new Date();
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() + 2);
    while (JS_DAYS[date.getUTCDay()] !== c.dayOfWeek) date.setUTCDate(date.getUTCDate() + 1);
    if (date > c.semester.endDate) continue;
    // A room of the same type that seats the section and has no class at that weekday and time.
    const busy = await db.schedule.findMany({ where: { dayOfWeek: c.dayOfWeek, startMin: { lt: c.endMin }, endMin: { gt: c.startMin }, status: { not: "ARCHIVED" } }, select: { roomId: true } });
    const alt = await db.room.findFirst({
      where: { id: { notIn: [c.roomId, ...busy.map((b) => b.roomId)] }, roomType: c.room.roomType, capacity: { gte: c.section.studentCount }, status: "AVAILABLE", archivedAt: null, OR: [{ departmentId }, { departmentId: null }] },
      orderBy: { capacity: "asc" },
    });
    if (!alt) continue;
    const batch = await db.adjustmentBatch.create({ data: { cause: "ROOM_BOOKING", summary: `${c.room.roomName} taken for "Accreditation visit" (Urgent priority)`, createdById: liza.id, departmentId } });
    await db.scheduleAdjustment.create({
      data: { batchId: batch.id, scheduleId: c.id, kind: "MOVED", date, roomId: alt.id, reason: `Moved to ${alt.roomName}, a free room of the right type at the same time. ${c.room.roomName} was taken for an urgent booking: "Accreditation visit".`, departmentId },
    });
    const booking = await db.roomBooking.create({
      data: {
        roomId: c.roomId, bookedById: liza.id, purpose: "Accreditation visit", date, startMin: c.startMin, endMin: c.endMin, attendees: Math.min(c.room.capacity, 25),
        status: "CONFIRMED", priority: "URGENT", urgentReason: "ACCREDITATION", reasonDetail: "Accreditation team walk-through", departmentId, batchId: batch.id,
      },
    });
    await db.bookingAcknowledgement.create({ data: { bookingId: booking.id, facultyId: c.facultyId } });
    await db.auditLog.create({
      data: { userId: liza.id, role: "HEAD_OF_DEPARTMENT", departmentId, entity: "RoomBooking", entityId: booking.id, action: `Urgent override of ${c.room.roomName}: 1 class(es) and 0 booking(s) displaced`, newValue: { priority: "URGENT", reason: "Accreditation or inspection", movedTo: alt.roomName } },
    });
    return;
  }
}
