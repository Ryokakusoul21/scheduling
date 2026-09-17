import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { STAFF_ROLES } from "@/lib/permissions/roles";
import { RequestsManager } from "./manager";

export const metadata = { title: "Schedule Requests · GCST Scheduling" };

export default async function RequestsPage() {
  const user = await requireUser();
  const isStaff = STAFF_ROLES.includes(user.role as (typeof STAFF_ROLES)[number]);

  const [requests, schedules] = await Promise.all([
    prisma.scheduleRequest.findMany({
      where: isStaff ? {} : { requestedById: user.id },
      include: {
        requestedBy: { select: { name: true } },
        reviewedBy: { select: { name: true } },
        schedule: { include: { subject: true, section: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.schedule.findMany({ include: { subject: true, section: true }, take: 200 }),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Schedule Requests</h1>
        <p className="text-sm text-muted-foreground">
          {isStaff ? "Review and act on submitted scheduling requests." : "Submit and track your scheduling requests."}
        </p>
      </div>

      <RequestsManager
        isStaff={isStaff}
        requests={requests.map((r) => ({
          id: r.id,
          type: r.type,
          status: r.status,
          reason: r.reason ?? "",
          reviewNote: r.reviewNote ?? "",
          requestedByName: r.requestedBy.name,
          reviewedByName: r.reviewedBy?.name ?? "",
          scheduleLabel: r.schedule ? `${r.schedule.subject.code} · ${r.schedule.section.name}` : "—",
          createdAt: r.createdAt.toLocaleString(),
        }))}
        schedules={schedules.map((s) => ({ id: s.id, label: `${s.subject.code} · ${s.section.name}` }))}
      />
    </div>
  );
}
