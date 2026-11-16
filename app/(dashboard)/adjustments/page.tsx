import { roomLabel } from "@/lib/rooms/label";
import { prisma } from "@/lib/db/prisma";
import { SCHEDULING_ROLES } from "@/lib/permissions/roles";
import { requireScope } from "@/lib/permissions/scope";
import { isoDate, ONLINE_ROOM } from "@/lib/occupancy/engine";
import type { PlanItem } from "@/lib/occupancy/adjust";
import { PageHeader } from "@/components/ux/states";
import { AdjustmentWorkspace, type BatchView, type ReportView } from "./adjustment-workspace";

export const metadata = { title: "Schedule Adjustments · GRANBY COLLEGES OF SCIENCE AND TECHNOLOGY" };

const CAUSE_LABELS = {
  ROOM_BOOKING: "Room booking",
  FACULTY_UNAVAILABLE: "Faculty unavailable",
  ROOM_UNAVAILABLE: "Room unavailable",
  CLASS_SUSPENSION: "Class suspension",
};

export default async function AdjustmentsPage({ searchParams }: { searchParams: Promise<{ report?: string }> }) {
  const scope = await requireScope(...SCHEDULING_ROLES);
  const { report } = await searchParams;
  const dept = scope.isAdmin ? {} : { departmentId: scope.manageDepartmentId };
  const since = new Date();
  since.setDate(since.getDate() - 60);

  const [faculty, rooms, reports, batches] = await Promise.all([
    prisma.faculty.findMany({ where: { status: "ACTIVE", archivedAt: null, ...dept }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true } }),
    prisma.room.findMany({ where: { ...dept, archivedAt: null }, orderBy: { roomNumber: "asc" }, select: { id: true, roomNumber: true, roomName: true } }),
    prisma.unavailability.findMany({
      where: { kind: "FACULTY", status: "PENDING", faculty: dept },
      include: { faculty: { select: { fullName: true } } },
      orderBy: { startDate: "asc" },
    }),
    prisma.adjustmentBatch.findMany({
      where: {
        createdAt: { gte: since },
        ...(scope.isAdmin ? {} : { OR: [{ createdById: scope.userId }, { adjustments: { some: { schedule: { section: { departmentId: scope.manageDepartmentId } } } } }] }),
      },
      include: {
        booking: { select: { id: true, priority: true } },
        adjustments: {
          include: {
            schedule: {
              include: { subject: { select: { code: true } }, section: { select: { name: true } }, room: { select: { roomNumber: true, roomName: true } }, faculty: { select: { fullName: true } } },
            },
          },
          orderBy: [{ date: "asc" }],
        },
      },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
  ]);

  const [roomNames, facultyNames] = await Promise.all([
    prisma.room.findMany({ select: { id: true, roomNumber: true, roomName: true } }).then((r) => new Map(r.map((x) => [x.id, roomLabel(x)]))),
    prisma.faculty.findMany({ select: { id: true, fullName: true } }).then((f) => new Map(f.map((x) => [x.id, x.fullName]))),
  ]);

  const batchViews: BatchView[] = batches.map((b) => {
    const makeUps = b.adjustments.filter((a) => a.kind === "MAKE_UP");
    const items: (PlanItem & { makeUpScheduled: boolean })[] = b.adjustments.map((a) => {
      const s = a.schedule;
      const before = { date: isoDate(a.date), roomId: s.roomId ?? "", roomName: (roomLabel(s.room) || "Online (live)"), facultyId: s.facultyId, facultyName: s.faculty.fullName, startMin: s.startMin, endMin: s.endMin };
      const roomId = a.kind === "ONLINE" ? "" : (a.roomId ?? s.roomId ?? "");
      const facultyId = a.facultyId ?? s.facultyId;
      const after = a.kind === "CANCELLED" ? null : {
        date: a.newDate ? isoDate(a.newDate) : before.date, roomId, roomName: a.kind === "ONLINE" ? ONLINE_ROOM : (roomNames.get(roomId) ?? "Room"),
        facultyId, facultyName: facultyNames.get(facultyId) ?? "Faculty", startMin: a.startMin ?? s.startMin, endMin: a.endMin ?? s.endMin,
      };
      return {
        scheduleId: a.scheduleId,
        label: `${s.subject.code} ${s.section.name}${a.kind === "MAKE_UP" ? " (make-up)" : ""}`,
        departmentId: null,
        before,
        after,
        kind: a.kind === "CANCELLED" ? "CANCELLED" : a.kind === "ONLINE" ? "ONLINE" : "MOVED",
        reason: a.reason,
        makeUpScheduled: a.kind === "CANCELLED" && makeUps.some((m) => m.scheduleId === a.scheduleId && isoDate(m.date) === isoDate(a.date)),
      };
    });
    const booking = b.booking ? { id: b.booking.id, label: b.booking.priority === "REGULAR" || b.booking.priority === "HIGH" ? "View booking" : "View urgent booking" } : null;
    return { id: b.id, cause: b.cause === "CLASS_SUSPENSION" && b.adjustments.some((item) => item.kind === "ONLINE") ? "Virtual classes" : CAUSE_LABELS[b.cause], summary: b.summary, createdAt: b.createdAt.toISOString(), undone: !!b.undoneAt, booking, items };
  });

  const reportViews: ReportView[] = reports.map((r) => ({
    id: r.id,
    facultyId: r.facultyId!,
    facultyName: r.faculty?.fullName ?? "",
    start: isoDate(r.startDate),
    end: isoDate(r.endDate),
    startMin: r.startMin,
    endMin: r.endMin,
    reason: r.reason,
  }));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Schedule Adjustments"
        description="When a faculty member or room becomes unavailable, affected schedules are regenerated automatically. Preview the before-and-after comparison, apply it, offer make-up classes, and undo if needed."
      />
      <AdjustmentWorkspace
        faculty={faculty.map((f) => ({ value: f.id, label: f.fullName }))}
        rooms={rooms.map((r) => ({ value: r.id, label: roomLabel(r) }))}
        reports={reportViews}
        batches={batchViews}
        initialReportId={report}
      />
    </div>
  );
}
