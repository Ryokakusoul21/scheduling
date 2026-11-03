import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/db/prisma";
import type { Scope } from "@/lib/permissions/scope";
import { workloadView } from "@/lib/workload/view";
import { loadPlan } from "@/lib/occupancy/load";
import { activeOverlapConflicts } from "@/lib/scheduler/term-conflicts";

/** Request-scoped loaders so each dashboard widget can stream on its own without repeating queries. */

const TIME_ZONE = "Asia/Manila";

/** Current Manila wall-clock time, so "today" and greetings match the school's day. */
export function manilaNow() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: TIME_ZONE }));
}

export const getActiveTerms = cache(() =>
  prisma.semester.findMany({
    where: { isActive: true },
    include: { program: { select: { code: true } }, academicYear: { select: { name: true } } },
    orderBy: [{ level: "asc" }],
  })
);

export const getWorkload = cache((scope: Scope) => workloadView(scope, { history: 5 }));

/** Today's real sessions school-wide, after room bookings, substitutions, suspensions, and holidays. */
export const getToday = cache(async () => {
  const now = manilaNow();
  const iso = now.toLocaleDateString("en-CA");
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const plan = await loadPlan(iso, iso);
  const upcoming = plan.sessions
    .filter((s) => s.endMin >= nowMin)
    .sort((a, b) => a.startMin - b.startMin)
    .map((s) => ({
      id: `${s.scheduleId}-${s.date}`,
      startMin: s.startMin,
      endMin: s.endMin,
      moved: s.status !== "REGULAR",
      subject: plan.classInfo.get(s.scheduleId)?.subjectCode ?? "",
      section: plan.classInfo.get(s.scheduleId)?.sectionName ?? "",
      room: plan.roomName.get(s.roomId) ?? "",
      faculty: plan.facultyName.get(s.facultyId) ?? "",
    }));
  return { total: plan.sessions.length, upcoming };
});

/** School-wide counts behind the Administrator's key figures and Needs attention list. */
export const getAdminCounts = cache(async () => {
  const termIds = (await getActiveTerms()).map((t) => t.id);
  const inActiveTerms = { semesterId: { in: termIds }, status: { not: "ARCHIVED" as const } };
  const [conflicts, toPublish, pendingRequests, pendingAccounts, pendingReports, pendingProposals, totalSections, scheduled] = await Promise.all([
    activeOverlapConflicts(),
    prisma.schedule.count({ where: { ...inActiveTerms, status: { in: ["DRAFT", "REVIEW"] } } }),
    prisma.scheduleRequest.count({ where: { status: "PENDING" } }),
    prisma.user.count({ where: { status: "PENDING", archivedAt: null, emailVerified: { not: null } } }),
    prisma.unavailability.count({ where: { status: "PENDING" } }),
    prisma.workloadProposal.count({ where: { status: "PENDING" } }),
    prisma.section.count(),
    prisma.schedule.findMany({ where: inActiveTerms, select: { sectionId: true }, distinct: ["sectionId"] }),
  ]);
  return {
    conflicts: conflicts.length,
    toPublish,
    pendingRequests,
    pendingAccounts,
    pendingReports,
    pendingProposals,
    unscheduledSections: termIds.length ? totalSections - scheduled.length : 0,
  };
});

const dayKey = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: TIME_ZONE });

/** Latest audit entries with sign-in and sign-out events marked, labeled by Manila day. */
export const getRecentActivity = cache(async () => {
  const include = { user: { select: { name: true } } };
  // A separate query without sign-ins keeps meaningful changes visible on busy sign-in days.
  const [all, changes] = await Promise.all([
    prisma.auditLog.findMany({ take: 12, orderBy: { createdAt: "desc" }, include }),
    prisma.auditLog.findMany({ where: { entity: { not: "Auth" } }, take: 12, orderBy: { createdAt: "desc" }, include }),
  ]);
  const today = dayKey(new Date());
  const yesterday = dayKey(new Date(Date.now() - 86_400_000));
  return [...new Map([...all, ...changes].map((l) => [l.id, l])).values()]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((l) => {
      const key = dayKey(l.createdAt);
      return {
        id: l.id,
        action: l.action,
        who: l.user?.name ?? "System",
        auth: l.entity === "Auth" || /^Signed (in|out)/.test(l.action),
        day: key === today ? "Today" : key === yesterday ? "Yesterday" : l.createdAt.toLocaleDateString("en-PH", { timeZone: TIME_ZONE, weekday: "short", month: "short", day: "numeric" }),
        time: l.createdAt.toLocaleTimeString("en-PH", { timeZone: TIME_ZONE, hour: "numeric", minute: "2-digit" }),
      };
    });
});

export type ActivityEntry = Awaited<ReturnType<typeof getRecentActivity>>[number];
