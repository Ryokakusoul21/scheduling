import { prisma } from "@/lib/db/prisma";
import { requireScope } from "@/lib/permissions/scope";
import { SchedulingPeriodsManager } from "./manager";

export const metadata = { title: "Scheduling Periods · GRANBY COLLEGES OF SCIENCE AND TECHNOLOGY" };

export default async function SchedulingPeriodsPage() {
  await requireScope("REGISTRAR");
  const [semesters, periods] = await Promise.all([
    prisma.semester.findMany({
      orderBy: [{ startDate: "desc" }, { name: "asc" }],
      include: { academicYear: { select: { name: true } } },
    }),
    prisma.schedulingPeriod.findMany({
      orderBy: [{ startsAt: "desc" }, { name: "asc" }],
      include: { semester: { include: { academicYear: { select: { name: true } } } } },
    }),
  ]);
  return (
    <SchedulingPeriodsManager
      semesters={semesters.map((semester) => ({
        id: semester.id,
        label: `${semester.academicYear.name} · ${semester.name}`,
      }))}
      periods={periods.map((period) => ({
        id: period.id,
        semesterId: period.semesterId,
        semester: `${period.semester.academicYear.name} · ${period.semester.name}`,
        kind: period.kind,
        name: period.name,
        startsAt: period.startsAt.toISOString(),
        endsAt: period.endsAt.toISOString(),
        status: period.status,
      }))}
    />
  );
}
