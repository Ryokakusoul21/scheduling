import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { Scope } from "@/lib/permissions/scope";
import { addDays, eachDate, isoDate } from "@/lib/occupancy/engine";
import { loadPlan } from "@/lib/occupancy/load";
import { formatRange } from "@/lib/scheduler/timetable";
import { formatLongDate } from "@/lib/calendar";
import type { ActivityListItem, ActivityStatus } from "./status";

/**
 * Which activities a person sees: approved ones for everyone, plus every status of their own
 * department's submissions (Head of Department) or of all departments (Administrator).
 */
export function visibleActivities(scope: Pick<Scope, "isAdmin" | "role" | "departmentId">): Prisma.ActivityWhereInput {
  if (scope.isAdmin) return {};
  if (scope.role === "HEAD_OF_DEPARTMENT" && scope.departmentId) return { OR: [{ status: "APPROVED" }, { departmentId: scope.departmentId }] };
  return { status: "APPROVED" };
}

const include = { department: { select: { name: true } }, room: { select: { roomName: true } } } as const;
type Row = Prisma.ActivityGetPayload<{ include: typeof include }>;

/** Activities with display fields; conflicts are filled in only when requested (they need the occupancy plan). */
export async function listActivities(where: Prisma.ActivityWhereInput, opts: { conflicts?: boolean } = {}): Promise<ActivityListItem[]> {
  const rows = await prisma.activity.findMany({ where, include, orderBy: [{ startDate: "asc" }, { startMin: "asc" }] });
  const submitters = new Map(
    (await prisma.user.findMany({ where: { id: { in: rows.map((r) => r.createdById).filter((id): id is string => !!id) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]),
  );
  const conflicts = opts.conflicts ? await activityConflicts(rows) : new Map<string, string[]>();
  return rows.map((a) => ({
    id: a.id,
    type: a.type,
    title: a.title,
    description: a.description ?? "",
    startDate: isoDate(a.startDate),
    endDate: isoDate(a.endDate),
    startMin: a.startMin,
    endMin: a.endMin,
    departmentId: a.departmentId,
    department: a.department?.name ?? "All departments",
    level: a.level,
    roomId: a.roomId,
    locationText: a.location ?? "",
    location: [a.room?.roomName, a.location].filter(Boolean).join(", "),
    participants: a.participants ?? "",
    status: a.status as ActivityStatus,
    reviewNote: a.reviewNote ?? "",
    submittedBy: (a.createdById && submitters.get(a.createdById)) || "Administrator",
    submittedAt: a.createdAt.toISOString(),
    conflicts: conflicts.get(a.id) ?? [],
  }));
}

/** Longest span checked for conflicts, so a term-long activity cannot load a whole year of classes. */
const MAX_DAYS = 31;

/**
 * Rooms, classes, examinations, and bookings that overlap each activity. Classes and examinations count
 * when they belong to the activity's department and school level (all of them for institution-wide ones).
 */
export async function activityConflicts(activities: Row[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (activities.length === 0) return out;
  const spans = activities.map((a) => {
    const from = isoDate(a.startDate);
    const end = isoDate(a.endDate);
    const capped = addDays(from, MAX_DAYS - 1);
    return { a, from, to: end < capped ? end : capped };
  });
  const from = spans.reduce((m, s) => (s.from < m ? s.from : m), spans[0].from);
  const to = spans.reduce((m, s) => (s.to > m ? s.to : m), spans[0].to);

  const [plan, sections, others] = await Promise.all([
    loadPlan(from, to),
    prisma.section.findMany({ select: { id: true, level: true, program: { select: { departmentId: true } } } }),
    prisma.activity.findMany({
      where: { status: "APPROVED", roomId: { not: null }, startDate: { lte: new Date(`${to}T00:00:00Z`) }, endDate: { gte: new Date(`${from}T00:00:00Z`) } },
      select: { id: true, title: true, roomId: true, startDate: true, endDate: true, startMin: true, endMin: true },
    }),
  ]);
  const sectionInfo = new Map(sections.map((s) => [s.id, { level: s.level, departmentId: s.program?.departmentId ?? null }]));

  for (const { a, from: start, to: end } of spans) {
    const lo = a.startMin ?? 0;
    const hi = a.endMin ?? 24 * 60;
    const overlaps = (o: { startMin: number; endMin: number }) => o.startMin < hi && lo < o.endMin;
    const affects = (sectionIds: string[]) =>
      sectionIds.some((id) => {
        const s = sectionInfo.get(id);
        return !!s && (!a.departmentId || s.departmentId === a.departmentId) && (!a.level || s.level === a.level);
      });

    const notes: string[] = [];
    for (const date of eachDate(start, end)) {
      const day = plan.ctx.occupants.filter((o) => o.date === date && overlaps(o));
      const when = formatLongDate(date, { month: "short", day: "numeric" });
      if (plan.ctx.holidays.has(date)) notes.push(`${when}: falls on a holiday.`);
      if (a.roomId) {
        for (const o of day.filter((o) => o.roomId === a.roomId)) notes.push(`${when}: room already used by ${o.label} (${formatRange(o.startMin, o.endMin)}).`);
        for (const x of others) {
          if (x.id === a.id || x.roomId !== a.roomId || isoDate(x.startDate) > date || isoDate(x.endDate) < date) continue;
          if (overlaps({ startMin: x.startMin ?? 0, endMin: x.endMin ?? 24 * 60 })) notes.push(`${when}: room already used by the approved activity "${x.title}".`);
        }
      }
      const classes = day.filter((o) => o.kind === "CLASS" && o.roomId !== a.roomId && affects(o.sectionIds)).length;
      if (classes) notes.push(`${when}: ${classes} class meeting(s) of the participating sections overlap.`);
      for (const o of day.filter((o) => o.kind === "EXAMINATION" && o.roomId !== a.roomId && affects(o.sectionIds))) notes.push(`${when}: ${o.label} (${formatRange(o.startMin, o.endMin)}).`);
    }
    if (isoDate(a.endDate) > end) notes.push(`Only the first ${MAX_DAYS} days were checked.`);
    out.set(a.id, notes);
  }
  return out;
}
