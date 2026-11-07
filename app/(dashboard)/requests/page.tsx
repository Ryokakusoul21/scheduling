import { prisma } from "@/lib/db/prisma";
import { getScope } from "@/lib/permissions/scope";
import { STAFF_ROLES } from "@/lib/permissions/roles";
import { RequestsManager } from "./manager";
import { canCancelRequest, canEditRequest, canReviewRequest, type RequestDetails, type RequestRow } from "@/lib/requests/rules";
import { formatRange } from "@/lib/scheduler/timetable";
import { loadWorkload } from "@/lib/workload/load";
import { loadReport } from "@/lib/workload/optimizer";
import { activeTermIds } from "@/lib/workload/auto";
import { projectionWarning } from "@/lib/workload/projection";
import type { CrossDepartmentDetails } from "@/lib/requests/cross-department";

export const metadata = { title: "Schedule Requests · GRANBY COLLEGES OF SCIENCE AND TECHNOLOGY" };

export default async function RequestsPage() {
  const scope = await getScope();
  const isStaff = STAFF_ROLES.includes(scope.role);
  const own = scope.manageDepartmentId;

  // The Registrar sees every request; a Head of Department their own, their department's, and requests
  // aimed at their department; faculty only their own.
  const where = scope.isAdmin
    ? {}
    : isStaff
      ? { OR: [{ requestedById: scope.userId }, { targetDepartmentId: own }, { requestedBy: { faculty: { departmentId: own } }, type: { notIn: ["CROSS_DEPARTMENT" as const, "FACULTY_CHANGE" as const] } }] }
      : { requestedById: scope.userId };

  const [requests, schedules, rooms, faculty] = await Promise.all([
    prisma.scheduleRequest.findMany({
      where,
      include: {
        requestedBy: { select: { name: true, role: true, faculty: { select: { departmentId: true } } } },
        reviewedBy: { select: { name: true } },
        schedule: { include: { subject: true, section: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.schedule.findMany({
      where: scope.isAdmin ? {} : { OR: [{ section: { departmentId: own } }, ...(scope.facultyId ? [{ facultyId: scope.facultyId }] : [])] },
      include: { subject: true, section: true, room: true, faculty: { select: { fullName: true } } },
      orderBy: [{ subject: { code: "asc" } }, { section: { name: "asc" } }],
      take: 500,
    }),
    prisma.room.findMany({ where: { archivedAt: null }, select: { id: true, roomNumber: true, roomName: true }, orderBy: { roomNumber: "asc" } }),
    prisma.faculty.findMany({ where: { status: "ACTIVE", archivedAt: null }, select: { id: true, fullName: true, department: { select: { name: true } } }, orderBy: { fullName: "asc" } }),
  ]);

  // Pending cross-department classes add load to another department's faculty member; show where that leaves them.
  const crossPending = requests.filter((r) => r.status === "PENDING" && r.type === "CROSS_DEPARTMENT");
  const workload = isStaff && crossPending.length ? await loadWorkload(await activeTermIds(), null) : null;
  const loads = workload ? new Map(loadReport(workload.faculty, workload.assignments, workload.limits).map((r) => [r.facultyId, r])) : new Map();
  const units = workload?.limits.measure === "UNITS"
    ? new Map((await prisma.subject.findMany({ where: { id: { in: crossPending.map((r) => (r.details as unknown as CrossDepartmentDetails).input?.subjectId).filter(Boolean) } }, select: { id: true, units: true } })).map((s) => [s.id, s.units]))
    : new Map<string, number>();
  const workloadWarning = (r: (typeof requests)[number]) => {
    if (!workload || r.status !== "PENDING" || r.type !== "CROSS_DEPARTMENT") return null;
    const input = (r.details as unknown as CrossDepartmentDetails).input;
    const load = input?.facultyId ? loads.get(input.facultyId) : null;
    if (!load) return null;
    const delta = workload.limits.measure === "HOURS" ? (input.endMin - input.startMin) / 60 : (units.get(input.subjectId) ?? 0);
    return projectionWarning(load, delta, workload.limits.measure === "HOURS" ? "hours" : "units");
  };

  const who = { role: scope.role, userId: scope.userId, departmentIds: scope.departmentIds };
  const day = (d: string) => `${d[0]}${d.slice(1).toLowerCase()}`;

  return (
    <RequestsManager
      description={isStaff
        ? scope.isAdmin ? "Track scheduling requests from every department. Heads of Department decide them." : "Submit scheduling requests, and edit, approve, reject or cancel those that belong to your department."
        : "Submit scheduling requests and follow their status. Your Head of Department decides them."}
      me={scope.name}
      requests={requests.map((r): RequestRow => {
        const details = (r.details ?? {}) as RequestDetails;
        const mine = r.requestedById === scope.userId;
        const asReviewable = { ...r, requesterRole: r.requestedBy.role };
        return {
          id: r.id,
          type: r.type,
          status: r.status,
          reason: r.reason ?? details.reason ?? "",
          reviewNote: r.reviewNote ?? "",
          requestedByName: r.requestedBy.name,
          reviewedByName: r.reviewedBy?.name ?? "",
          scheduleLabel: r.schedule ? `${r.schedule.subject.code} · ${r.schedule.section.name}` : r.type === "SUBJECT_CHANGE" ? `Subject ${(r.details as { subjectCode?: string }).subjectCode ?? ""}`.trim() : "Not applicable",
          scheduleId: r.scheduleId,
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.updatedAt.toISOString(),
          current: details.current ?? null,
          requested: details.requested ?? null,
          form: details.form ?? null,
          mine,
          canReview: canReviewRequest(who, asReviewable),
          canEdit: canEditRequest(who, asReviewable),
          canCancel: canCancelRequest(who, asReviewable),
          workloadWarning: workloadWarning(r),
        };
      })}
      schedules={schedules.map((s) => ({
        id: s.id,
        code: s.subject.code,
        section: s.section.name,
        day: day(s.dayOfWeek),
        time: formatRange(s.startMin, s.endMin),
        room: s.room.roomNumber,
        faculty: s.faculty.fullName,
      }))}
      rooms={rooms.map((r) => ({ id: r.id, label: `${r.roomNumber} ${r.roomName}` }))}
      faculty={faculty.map((f) => ({ id: f.id, label: `${f.fullName} · ${f.department?.name ?? "No department"}` }))}
    />
  );
}
