import "server-only";
import { prisma } from "@/lib/db/prisma";
import { loadForecast, upcomingTerms } from "@/lib/forecast/load";
import { formatRange, DAY_LONG } from "@/lib/scheduler/timetable";
import { isoDate } from "@/lib/occupancy/engine";

/** Head of Department extras: next-semester needs and everything waiting for their decision. */
export async function departmentExtras(departmentId: string) {
  const records = await prisma.enrollmentRecord.findMany({ select: { academicYear: true, termType: true } });
  const target = records.length ? upcomingTerms(records)[0] : null;
  const since = new Date();
  since.setDate(since.getDate() - 14);
  const inDept = { section: { program: { departmentId } } };

  const [forecast, awaiting, bookingBatches, reports] = await Promise.all([
    target ? loadForecast(target, departmentId) : null,
    prisma.schedule.findMany({
      where: { status: { in: ["DRAFT", "REVIEW"] }, semester: { isActive: true }, ...inDept },
      include: { subject: { select: { code: true } }, section: { select: { name: true } }, faculty: { select: { fullName: true } } },
      orderBy: { updatedAt: "desc" },
      take: 8,
    }),
    prisma.adjustmentBatch.findMany({
      where: { undoneAt: null, createdAt: { gte: since }, adjustments: { some: { schedule: inDept } } },
      include: { _count: { select: { adjustments: true } } },
      orderBy: { createdAt: "desc" },
      take: 6,
    }),
    prisma.unavailability.findMany({ where: { status: "PENDING", faculty: { departmentId } }, include: { faculty: { select: { fullName: true } } }, orderBy: { startDate: "asc" } }),
  ]);

  const sum = <T,>(rows: T[], pick: (r: T) => number) => rows.reduce((s, r) => s + pick(r), 0);
  return {
    needs: forecast && target
      ? {
          term: target.label,
          sections: { needed: sum(forecast.series, (s) => s.sectionsNeeded), now: sum(forecast.series, (s) => s.sectionsNow) },
          faculty: { needed: sum(forecast.facultyRows, (r) => r.needed), now: sum(forecast.facultyRows, (r) => r.now) },
          rooms: forecast.roomRows.map((r) => ({ type: r.type, needed: r.needed, now: r.now })),
        }
      : null,
    approvals: {
      schedules: awaiting.map((s) => ({
        id: s.id,
        label: `${s.subject.code} ${s.section.name}`,
        detail: `${DAY_LONG[s.dayOfWeek]} ${formatRange(s.startMin, s.endMin)} · ${s.faculty.fullName}`,
        status: s.status === "REVIEW" ? "Edited, awaiting approval" : "New draft",
      })),
      bookingChanges: bookingBatches.map((b) => ({ id: b.id, summary: b.summary, moved: b._count.adjustments, cause: b.cause, at: b.createdAt.toISOString() })),
      reports: reports.map((r) => ({ id: r.id, name: r.faculty?.fullName ?? "Faculty", dates: isoDate(r.startDate) === isoDate(r.endDate) ? isoDate(r.startDate) : `${isoDate(r.startDate)} to ${isoDate(r.endDate)}`, reason: r.reason })),
    },
  };
}

export type DepartmentExtras = Awaited<ReturnType<typeof departmentExtras>>;
