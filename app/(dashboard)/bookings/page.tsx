import { prisma } from "@/lib/db/prisma";
import { departmentWhere } from "@/lib/permissions/department";
import { getScope } from "@/lib/permissions/scope";
import { PageHeader } from "@/components/ux/states";
import { allowedPriorities, canManageBooking, canReviewOverride, isOverride, statusLabel, URGENT_REASONS, type Priority } from "@/lib/bookings/plan";
import { overrideCaps } from "@/lib/bookings/service";
import { getBookingSettings } from "@/lib/settings";
import { ONLINE_ROOM, isoDate } from "@/lib/occupancy/engine";
import { formatRange } from "@/lib/scheduler/timetable";
import { BookingWorkspace, type AckRow, type BookingRow } from "./booking-workspace";
import { formatDay, manilaClock, relativeDay } from "./format";

export const metadata = { title: "Room Booking · GRANBY COLLEGES OF SCIENCE AND TECHNOLOGY" };

const reasonLabel = (r: string | null) => URGENT_REASONS.find((x) => x.value === r)?.label ?? null;

export default async function BookingsPage({ searchParams }: { searchParams: Promise<{ booking?: string }> }) {
  const scope = await getScope();
  const { booking: openId } = await searchParams;
  const since = new Date();
  since.setDate(since.getDate() - 30);
  const approver = scope.isAdmin ? {} : { approvalDepartmentId: { in: scope.departmentIds } };

  const [bookings, rooms, faculty, departments, myAcks, settings] = await Promise.all([
    prisma.roomBooking.findMany({
      // Own bookings, plus overrides of rooms this person must approve; the Registrar sees all.
      where: { date: { gte: since }, ...(scope.isAdmin ? {} : { OR: [{ bookedById: scope.userId }, ...(scope.role === "HEAD_OF_DEPARTMENT" ? [approver, { departmentId: { in: scope.departmentIds } }] : [])] }) },
      include: {
        room: { select: { roomName: true } },
        bookedBy: { select: { name: true } },
        acknowledgements: true,
        displaced: { select: { purpose: true, status: true, roomId: true } },
        batch: {
          select: {
            undoneAt: true,
            adjustments: { select: { kind: true, reason: true, date: true, newDate: true, roomId: true, startMin: true, endMin: true, schedule: { select: { startMin: true, endMin: true, roomId: true, facultyId: true, subject: { select: { code: true } }, section: { select: { name: true, departmentId: true } } } } } },
          },
        },
      },
      orderBy: [{ date: "desc" }, { startMin: "asc" }],
    }),
    prisma.room.findMany({ select: { id: true, roomName: true } }),
    prisma.faculty.findMany({ select: { id: true, fullName: true } }),
    prisma.department.findMany({ select: { id: true, name: true } }),
    scope.facultyId
      ? prisma.bookingAcknowledgement.findMany({ where: { facultyId: scope.facultyId, booking: { status: "CONFIRMED" } }, include: { booking: { select: { id: true, purpose: true, date: true, startMin: true, endMin: true, priority: true, room: { select: { roomName: true } }, bookedBy: { select: { name: true } } } } }, orderBy: { createdAt: "desc" }, take: 20 })
      : Promise.resolve([]),
    getBookingSettings(),
  ]);
  const roomName = new Map(rooms.map((r) => [r.id, r.roomName]));
  const facultyName = new Map(faculty.map((f) => [f.id, f.fullName]));
  const deptName = new Map(departments.map((d) => [d.id, d.name]));
  const own = (d: string | null) => scope.isAdmin || (!!d && scope.departmentIds.includes(d));

  // Computed on the server so the first render matches on both sides.
  const { today, nowMin } = manilaClock();
  const rows: BookingRow[] = bookings.map((b) => {
    const date = isoDate(b.date);
    const past = date < today || (date === today && b.endMin <= nowMin);
    const priority = b.priority as Priority;
    const mine = b.bookedById === scope.userId;
    const moves = b.batch && !b.batch.undoneAt
      ? b.batch.adjustments.filter((a) => a.kind !== "MAKE_UP").map((a) => {
          const s = a.schedule;
          const to = a.kind === "ONLINE" ? ONLINE_ROOM : roomName.get(a.roomId ?? s.roomId) ?? "Room";
          return {
            label: own(s.section.departmentId) ? `${s.subject.code} ${s.section.name}` : "A class of another department",
            faculty: own(s.section.departmentId) ? (facultyName.get(s.facultyId) ?? "") : "",
            from: `${roomName.get(s.roomId) ?? "Room"}, ${formatRange(s.startMin, s.endMin)}`,
            to: `${to}, ${a.newDate ? `${formatDay(isoDate(a.newDate))}, ` : ""}${formatRange(a.startMin ?? s.startMin, a.endMin ?? s.endMin)}`,
            kind: a.kind,
            reason: a.reason,
          };
        })
      : [];
    return {
      id: b.id,
      roomId: b.roomId,
      date,
      dateLabel: formatDay(date),
      relative: past ? null : relativeDay(date, today),
      past,
      startMin: b.startMin,
      endMin: b.endMin,
      roomName: b.room.roomName,
      purpose: b.purpose,
      attendees: b.attendees,
      status: b.status,
      statusLabel: statusLabel({ status: b.status, priority, past }),
      priority,
      reason: reasonLabel(b.urgentReason),
      reasonDetail: b.reasonDetail,
      reviewNote: b.reviewNote,
      awaitingDepartment: b.status === "AWAITING_APPROVAL" ? (deptName.get(b.approvalDepartmentId ?? "") ?? "the owning department") : null,
      canApprove: b.status === "AWAITING_APPROVAL" && !mine && canReviewOverride(scope, b.approvalDepartmentId),
      bookedBy: b.bookedBy.name,
      mine,
      canCancel: !past && canManageBooking(scope, b) && ["CONFIRMED", "AWAITING_APPROVAL", "PENDING"].includes(b.status),
      canEdit: !past && canManageBooking(scope, b) && b.status === "CONFIRMED",
      moves,
      displaced: b.displaced.map((d) => ({ purpose: d.purpose, outcome: d.status === "CANCELLED" ? "Cancelled; no other room was free" : `Moved to ${roomName.get(d.roomId) ?? "another room"}` })),
      acknowledgements: b.acknowledgements.map((a) => ({ faculty: facultyName.get(a.facultyId) ?? "Faculty", status: a.status, note: a.note })),
    };
  });

  const acks: AckRow[] = myAcks.map((a) => ({
    id: a.id,
    status: a.status,
    note: a.note,
    purpose: a.booking.purpose,
    room: a.booking.room.roomName,
    when: `${formatDay(isoDate(a.booking.date))}, ${formatRange(a.booking.startMin, a.booking.endMin)}`,
    bookedBy: a.booking.bookedBy.name,
  }));

  // Next half hour today, or tomorrow morning once the booking hours are over.
  const nextSlot = Math.max(settings.openMin, Math.ceil((nowMin + 1) / 30) * 30);
  const lateToday = nextSlot > settings.closeMin - 60;
  const tomorrow = new Date(Date.parse(`${today}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  const defaults = { date: lateToday ? tomorrow : today, startMin: lateToday ? 9 * 60 : nextSlot };
  const priorities = allowedPriorities(scope.role);
  const roomChoices = (await prisma.room.findMany({
    where: { archivedAt: null, ...(priorities.some(isOverride) ? {} : departmentWhere.room(scope)) },
    select: { id: true, roomName: true, capacity: true, floor: { select: { building: { select: { name: true } } } } },
    orderBy: { roomName: "asc" },
  })).map((r) => ({ value: r.id, label: `${r.roomName} · ${r.floor?.building.name ?? "No building"} · ${r.capacity} seats` }));

  return (
    <div className="space-y-6">
      <PageHeader title="Room Booking" description="Find and book a room for a meeting or activity. Urgent bookings can take a room in use and move the classes in it." />
      <BookingWorkspace
        readOnly={scope.isAdmin}
        bookings={rows}
        acknowledgements={acks}
        showBookedBy={scope.isAdmin}
        defaults={defaults}
        clock={{ today, nowMin }}
        priorities={priorities}
        roomChoices={roomChoices}
        caps={priorities.some(isOverride) ? await overrideCaps(scope) : null}
        hours={{ openMin: settings.openMin, closeMin: settings.closeMin, buffer: settings.bufferMinutes }}
        openId={openId ?? null}
      />
    </div>
  );
}
