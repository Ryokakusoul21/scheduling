import { prisma } from "@/lib/db/prisma";
import { getScope } from "@/lib/permissions/scope";
import { PageHeader } from "@/components/ux/states";
import { BookingWorkspace, type BookingRow } from "./booking-workspace";

export const metadata = { title: "Room Booking · GRANBY COLLEGES OF SCIENCE & TECHNOLOGY" };

export default async function BookingsPage() {
  const scope = await getScope();
  const since = new Date();
  since.setDate(since.getDate() - 30);

  const bookings = await prisma.roomBooking.findMany({
    where: { date: { gte: since }, ...(scope.isAdmin ? {} : { bookedById: scope.userId }) },
    include: {
      room: { select: { roomName: true } },
      bookedBy: { select: { name: true } },
      batch: {
        select: {
          undoneAt: true,
          adjustments: { select: { reason: true, kind: true, schedule: { select: { subject: { select: { code: true } }, section: { select: { name: true } } } } } },
        },
      },
    },
    orderBy: [{ date: "desc" }, { startMin: "asc" }],
  });

  const rows: BookingRow[] = bookings.map((b) => ({
    id: b.id,
    date: b.date.toISOString().slice(0, 10),
    startMin: b.startMin,
    endMin: b.endMin,
    roomName: b.room.roomName,
    purpose: b.purpose,
    attendees: b.attendees,
    status: b.status,
    bookedBy: b.bookedBy.name,
    canCancel: scope.isAdmin || b.bookedById === scope.userId,
    moves:
      b.batch && !b.batch.undoneAt
        ? b.batch.adjustments.map((a) => ({ label: `${a.schedule.subject.code} ${a.schedule.section.name}`, reason: a.reason }))
        : [],
  }));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Room Booking"
        description="Find a room for a meeting or activity. If a class already uses it, the class is moved automatically to the nearest suitable room or time, its faculty is notified, and you can undo the change."
      />
      <BookingWorkspace bookings={rows} showBookedBy={scope.isAdmin} />
    </div>
  );
}
