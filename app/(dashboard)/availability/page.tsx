import { prisma } from "@/lib/db/prisma";
import { TEACHING_ROLES } from "@/lib/permissions/roles";
import { requireScope } from "@/lib/permissions/scope";
import { isoDate } from "@/lib/occupancy/engine";
import { PageHeader } from "@/components/ux/states";
import { AvailabilityForm, type ReportRow } from "./availability-form";

export const metadata = { title: "Report Unavailability · GRANBY COLLEGES OF SCIENCE & TECHNOLOGY" };

export default async function AvailabilityPage() {
  const scope = await requireScope(...TEACHING_ROLES);
  const reports = scope.facultyId
    ? await prisma.unavailability.findMany({ where: { facultyId: scope.facultyId, kind: "FACULTY" }, orderBy: { startDate: "desc" }, take: 30 })
    : [];

  const rows: ReportRow[] = reports.map((r) => ({
    id: r.id,
    start: isoDate(r.startDate),
    end: isoDate(r.endDate),
    startMin: r.startMin,
    endMin: r.endMin,
    reason: r.reason,
    status: r.status,
    own: r.reportedById === scope.userId,
  }));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Report Unavailability"
        description="Tell your Head of Department and the Administrator when you cannot teach. They review it, and your classes are reassigned to a substitute or cancelled with make-up options."
      />
      <AvailabilityForm reports={rows} linked={!!scope.facultyId} />
    </div>
  );
}
