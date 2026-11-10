import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/db/prisma";
import type { Scope } from "@/lib/permissions/scope";
import { departmentWhere } from "@/lib/permissions/department";
import { departmentStaffing } from "@/lib/analytics/department-staffing";
import { getWorkloadSettings } from "@/lib/settings";
import { loadPlan } from "@/lib/occupancy/load";
import { addDays, ONLINE_ROOM } from "@/lib/occupancy/engine";
import { manilaNow } from "@/lib/student/format";
import { isPeriodOpenNow } from "@/lib/scheduler/period-rules";
import { latestTimetables, sectionReadiness, teachingDay } from "./summary";

export const getStaffingOverview = cache(departmentStaffing);

export async function administratorLanding(scope: Scope) {
  if (scope.role !== "SUPER_ADMINISTRATOR") throw new Error("Administrator access required");
  const [staffing, pendingAccounts, accounts, activity] = await Promise.all([
    getStaffingOverview(),
    prisma.user.count({ where: { status: "PENDING", archivedAt: null, emailVerified: { not: null } } }),
    prisma.user.findMany({ where: { status: "PENDING", archivedAt: null, emailVerified: { not: null } }, select: { id: true, name: true, role: true, createdAt: true }, orderBy: { createdAt: "asc" }, take: 4 }),
    import("@/components/dashboard/overview/data").then((module) => module.getRecentActivity()),
  ]);
  return { staffing, pendingAccounts, accounts, activity };
}

export async function registrarLanding(scope: Scope) {
  if (scope.role !== "REGISTRAR") throw new Error("Registrar access required");
  const now = new Date();
  const [counts, submissions, periods] = await Promise.all([
    prisma.timetableSubmission.groupBy({ by: ["status", "kind"], where: { status: { in: ["SUBMITTED", "APPROVED"] } }, _count: true }),
    prisma.timetableSubmission.findMany({
      where: { status: { in: ["SUBMITTED", "APPROVED"] } }, orderBy: { submittedAt: "asc" }, take: 6,
      include: { department: { select: { name: true } }, semester: { include: { academicYear: { select: { name: true } } } }, submittedBy: { select: { name: true } } },
    }),
    prisma.schedulingPeriod.findMany({ where: { status: "OPEN", endsAt: { gte: now } }, orderBy: { endsAt: "asc" }, include: { semester: { include: { academicYear: { select: { name: true } } } } } }),
  ]);
  return {
    submissions, periods,
    awaitingReview: counts.filter((row) => row.status === "SUBMITTED").reduce((sum, row) => sum + row._count, 0),
    awaitingPublication: counts.filter((row) => row.status === "APPROVED").reduce((sum, row) => sum + row._count, 0),
    examinationSubmissions: counts.filter((row) => row.kind === "EXAMINATION").reduce((sum, row) => sum + row._count, 0),
    openPeriods: periods.filter((period) => isPeriodOpenNow(period, now)).length,
  };
}

export async function headLanding(scope: Scope, termId: string) {
  if (scope.role !== "HEAD_OF_DEPARTMENT") throw new Error("Department access required");
  const term = await prisma.semester.findUniqueOrThrow({ where: { id: termId } });
  const departments = { in: scope.departmentIds };
  const [sections, submissions, periods, drafts, requests] = await Promise.all([
    prisma.section.findMany({
      where: { AND: [departmentWhere.section(scope), { archivedAt: null, level: term.level, OR: [{ semesterId: termId }, ...(term.level === "COLLEGE" ? [] : [{ semesterId: null }])] }] },
      select: { id: true, name: true, schedules: { where: { semesterId: termId, status: { not: "ARCHIVED" } }, select: { subjectId: true, component: true } }, classPlaceholders: { select: { subjectId: true, component: true } } }, orderBy: { name: "asc" },
    }),
    prisma.timetableSubmission.findMany({ where: { departmentId: departments, semesterId: termId }, include: { department: { select: { name: true } } }, orderBy: { version: "desc" } }),
    prisma.schedulingPeriod.findMany({ where: { semesterId: termId }, orderBy: { endsAt: "asc" } }),
    prisma.schedule.count({ where: { AND: [departmentWhere.schedule(scope), { semesterId: termId, status: "DRAFT" }] } }),
    prisma.scheduleRequest.count({ where: { status: "PENDING", OR: [{ departmentId: departments }, { targetDepartmentId: departments }] } }),
  ]);
  return { sections: sectionReadiness(sections), submissions: latestTimetables(submissions), periods, drafts, requests };
}

/** Only the signed-in teacher's published, adjusted meetings leave this loader. */
export async function facultyLanding(scope: Scope) {
  if (!["HEAD_OF_DEPARTMENT", "FACULTY"].includes(scope.role) || !scope.facultyId) throw new Error("Linked faculty access required");
  const facultyId = scope.facultyId;
  const now = manilaNow(new Date());
  const [plan, weekly, me, limits, notifications, requests, bookings] = await Promise.all([
    loadPlan(now.date, addDays(now.date, 7)),
    prisma.schedule.findMany({ where: { facultyId, status: { not: "ARCHIVED" }, semester: { isActive: true } }, select: { sectionId: true, subjectId: true, startMin: true, endMin: true, subject: { select: { units: true } } } }),
    prisma.faculty.findUniqueOrThrow({ where: { id: facultyId }, select: { maxHours: true } }),
    getWorkloadSettings(),
    prisma.notification.findMany({ where: { userId: scope.userId }, orderBy: { createdAt: "desc" }, take: 4 }),
    prisma.scheduleRequest.count({ where: { requestedById: scope.userId, status: "PENDING" } }),
    prisma.roomBooking.count({ where: { bookedById: scope.userId, status: "AWAITING_APPROVAL" } }),
  ]);
  const mine = plan.sessions.filter((session) => session.facultyId === facultyId);
  const published = new Set((await prisma.schedule.findMany({ where: { id: { in: mine.map((session) => session.scheduleId) }, status: "PUBLISHED" }, select: { id: true } })).map((row) => row.id));
  const sessions = mine.filter((session) => published.has(session.scheduleId)).map((session) => ({
    id: `${session.scheduleId}:${session.date}:${session.startMin}`, date: session.date, startMin: session.startMin, endMin: session.endMin,
    title: plan.label(session), room: !session.roomId ? ONLINE_ROOM : plan.roomName.get(session.roomId) ?? "Room to be announced", changed: session.status !== "REGULAR",
  }));
  const hours = Math.round(weekly.reduce((sum, row) => sum + row.endMin - row.startMin, 0) / 6) / 10;
  const units = [...new Map(weekly.map((row) => [`${row.sectionId}:${row.subjectId}`, row.subject.units])).values()].reduce((sum, value) => sum + value, 0);
  const value = limits.measure === "HOURS" ? hours : units;
  return {
    weekCount: sessions.filter((session) => session.date > now.date || session.endMin > now.minutes).length,
    ...teachingDay(sessions, now.date, now.minutes), date: now.date, minutes: now.minutes, notifications, requests, bookings,
    load: { value, maximum: limits.measure === "HOURS" ? Math.min(me.maxHours, limits.maximum) : limits.maximum, unit: limits.measure === "HOURS" ? "hours" : "units" },
  };
}
