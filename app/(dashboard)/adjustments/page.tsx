import { prisma } from "@/lib/db/prisma";
import { STAFF_ROLES } from "@/lib/permissions/roles";
import { requireScope } from "@/lib/permissions/scope";
import { isoDate } from "@/lib/occupancy/engine";
import type { PlanItem } from "@/lib/occupancy/adjust";
import { PageHeader } from "@/components/ux/states";
import { AdjustmentWorkspace, type BatchView, type ReportView } from "./adjustment-workspace";

export const metadata = { title: "Schedule Adjustments · GRANBY COLLEGES OF SCIENCE & TECHNOLOGY" };

const CAUSE_LABELS = {
  ROOM_BOOKING: "Room booking",
  FACULTY_UNAVAILABLE: "Faculty unavailable",
  ROOM_UNAVAILABLE: "Room unavailable",
  CLASS_SUSPENSION: "Class suspension",
};

export default async function AdjustmentsPage({ searchParams }: { searchParams: Promise<{ report?: string }> }) {
  const scope = await requireScope(...STAFF_ROLES);
  const { report } = await searchParams;
  const dept = scope.isAdmin ? {} : { departmentId: scope.manageDepartmentId };
  const since = new Date();
  since.setDate(since.getDate() - 60);

  const [faculty, rooms, sections, reports, batches] = await Promise.all([
    prisma.faculty.findMany({ where: { status: "ACTIVE", ...dept }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true } }),
    prisma.room.findMany({ where: dept, orderBy: { roomName: "asc" }, select: { id: true, roomName: true } }),
    prisma.section.findMany({
      where: scope.isAdmin ? {} : { program: { departmentId: scope.manageDepartmentId } },
      orderBy: [{ level: "asc" }, { sortOrder: "asc" }],
      select: { id: true, name: true, level: true },
    }),
    prisma.unavailability.findMany({
      where: { kind: "FACULTY", status: "PENDING", faculty: dept },
      include: { faculty: { select: { fullName: true } } },
      orderBy: { startDate: "asc" },
    }),
    prisma.adjustmentBatch.findMany({
      where: {
        createdAt: { gte: since },
        ...(scope.isAdmin ? {} : { OR: [{ createdById: scope.userId }, { adjustments: { some: { schedule: { section: { program: { departmentId: scope.manageDepartmentId } } } } } }] }),
      },
      include: {
        adjustments: {
          include: {
            schedule: {
              include: { subject: { select: { code: true } }, section: { select: { name: true } }, room: { select: { roomName: true } }, faculty: { select: { fullName: true } } },
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
    prisma.room.findMany({ select: { id: true, roomName: true } }).then((r) => new Map(r.map((x) => [x.id, x.roomName]))),
    prisma.faculty.findMany({ select: { id: true, fullName: true } }).then((f) => new Map(f.map((x) => [x.id, x.fullName]))),
  ]);

  const batchViews: BatchView[] = batches.map((b) => {
    const makeUps = b.adjustments.filter((a) => a.kind === "MAKE_UP");
    const items: (PlanItem & { makeUpScheduled: boolean })[] = b.adjustments.map((a) => {
      const s = a.schedule;
      const before = { date: isoDate(a.date), roomId: s.roomId, roomName: s.room.roomName, facultyId: s.facultyId, facultyName: s.faculty.fullName, startMin: s.startMin, endMin: s.endMin };
      const roomId = a.roomId ?? s.roomId;
      const facultyId = a.facultyId ?? s.facultyId;
      const after = a.kind === "CANCELLED" ? null : {
        date: a.newDate ? isoDate(a.newDate) : before.date, roomId, roomName: roomNames.get(roomId) ?? "Room",
        facultyId, facultyName: facultyNames.get(facultyId) ?? "Faculty", startMin: a.startMin ?? s.startMin, endMin: a.endMin ?? s.endMin,
      };
      return {
        scheduleId: a.scheduleId,
        label: `${s.subject.code} ${s.section.name}${a.kind === "MAKE_UP" ? " (make-up)" : ""}`,
        departmentId: null,
        before,
        after,
        kind: a.kind === "CANCELLED" ? "CANCELLED" : "MOVED",
        reason: a.reason,
        makeUpScheduled: a.kind === "CANCELLED" && makeUps.some((m) => m.scheduleId === a.scheduleId && isoDate(m.date) === isoDate(a.date)),
      };
    });
    return { id: b.id, cause: CAUSE_LABELS[b.cause], summary: b.summary, createdAt: b.createdAt.toISOString(), undone: !!b.undoneAt, items };
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
        description="When a faculty member or room becomes unavailable, or classes are suspended, affected schedules are regenerated automatically. Preview the before-and-after comparison, apply it, offer make-up classes, and undo if needed."
      />
      <AdjustmentWorkspace
        faculty={faculty.map((f) => ({ value: f.id, label: f.fullName }))}
        rooms={rooms.map((r) => ({ value: r.id, label: r.roomName }))}
        sections={sections.map((s) => ({ value: s.id, label: s.name }))}
        canSuspendAll={scope.isAdmin}
        reports={reportViews}
        batches={batchViews}
        initialReportId={report}
      />
    </div>
  );
}
