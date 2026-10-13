import "server-only";
import { prisma } from "@/lib/db/prisma";
import { levelLabel, termLabel } from "@/lib/academics/levels";
import { getWorkloadSettings } from "@/lib/settings";
import { loadPlan } from "@/lib/occupancy/load";
import { addDays, isoDate } from "@/lib/occupancy/engine";
import { loadWorkload } from "@/lib/workload/load";
import { loadReport, statusOf } from "@/lib/workload/optimizer";
import { formatRange, DAY_LONG } from "@/lib/scheduler/timetable";
import { peakHeatmap, HEATMAP_DAYS } from "./timetable";
import { countChange } from "./trends";
import { EXAM_TITLES } from "@/lib/examinations/notify";

const NOTIFICATION_KINDS: { kind: string; titles: string[] }[] = [
  { kind: "Workload change", titles: ["Your teaching load changed", "Teaching load change undone", "Teaching load reassigned"] },
  { kind: "Room conflict rescheduled", titles: ["Class rescheduled", "Schedule change undone"] },
  { kind: "Class suspension or cancellation", titles: ["Class cancelled", "Make-up class scheduled"] },
  { kind: "Unavailability update", titles: ["Unavailability report applied", "Unavailability report dismissed"] },
  {
    kind: "Examination",
    titles: [...Object.values(EXAM_TITLES.proctor), ...Object.values(EXAM_TITLES.instructor), ...Object.values(EXAM_TITLES.head), EXAM_TITLES.removed],
  },
];

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * One faculty member's teaching analytics for a term. Only their own classes, bookings, and notifications
 * are read; the department comparison is an average, so no colleague's details are exposed.
 */
export async function facultyAnalytics({ facultyId, userId, termId }: { facultyId: string; userId: string; termId: string }) {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
  const weekEnd = addDays(today, 6);
  const [term, me, limits] = await Promise.all([
    prisma.semester.findUniqueOrThrow({ where: { id: termId }, include: { academicYear: { select: { name: true } } } }),
    prisma.faculty.findUniqueOrThrow({ where: { id: facultyId }, include: { department: { select: { name: true } } } }),
    getWorkloadSettings(),
  ]);
  const prev = await prisma.semester.findFirst({ where: { level: term.level, programId: term.programId, endDate: { lt: term.startDate } }, orderBy: { endDate: "desc" }, include: { academicYear: { select: { name: true } } } });

  const [classes, prevClasses, plan, bookings, adjustments, fixes, notifications, exams, activities, department] = await Promise.all([
    prisma.schedule.findMany({
      where: { facultyId, semesterId: term.id, status: { not: "ARCHIVED" } },
      include: { subject: { select: { code: true, name: true, units: true } }, section: { select: { id: true, name: true, studentCount: true } }, room: { select: { roomName: true } } },
      orderBy: [{ dayOfWeek: "asc" }, { startMin: "asc" }],
    }),
    prev ? prisma.schedule.findMany({ where: { facultyId, semesterId: prev.id, status: { not: "ARCHIVED" } }, select: { startMin: true, endMin: true } }) : [],
    loadPlan(today, weekEnd),
    prisma.roomBooking.findMany({ where: { bookedById: userId, status: "CONFIRMED", date: { gte: new Date(`${today}T00:00:00Z`) } }, include: { room: { select: { roomName: true } } }, orderBy: { date: "asc" } }),
    prisma.scheduleAdjustment.findMany({
      where: { batch: { undoneAt: null }, OR: [{ schedule: { facultyId, semesterId: term.id } }, { facultyId }] },
      include: { batch: { select: { cause: true } }, schedule: { select: { subject: { select: { code: true } }, section: { select: { name: true } } } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.workloadFix.count({ where: { undoneAt: null, OR: [{ fromFacultyId: facultyId }, { toFacultyId: facultyId }] } }),
    prisma.notification.findMany({
      where: { userId, title: { in: NOTIFICATION_KINDS.flatMap((k) => k.titles) } },
      orderBy: { createdAt: "desc" },
      take: 12,
    }),
    prisma.examination.findMany({
      where: { date: { gte: new Date(`${today}T00:00:00Z`), lte: new Date(`${addDays(today, 21)}T00:00:00Z`) }, OR: [{ proctorId: facultyId }, { section: { schedules: { some: { facultyId } } } }] },
      include: { subject: { select: { code: true } }, section: { select: { name: true } }, room: { select: { roomName: true } } },
      orderBy: [{ date: "asc" }, { startMin: "asc" }],
    }),
    prisma.activity.findMany({ where: { endDate: { gte: new Date(`${today}T00:00:00Z`) }, startDate: { lte: new Date(`${addDays(today, 21)}T00:00:00Z`) } }, orderBy: { startDate: "asc" }, take: 8 }),
    loadWorkload([term.id], me.departmentId),
  ]);

  // Load in both measures, compared with the allowed range.
  const hours = round1(classes.reduce((s, c) => s + c.endMin - c.startMin, 0) / 60);
  const groups = new Map(classes.map((c) => [`${c.sectionId}|${c.subjectId}`, c]));
  const units = [...groups.values()].reduce((s, c) => s + c.subject.units, 0);
  const load = limits.measure === "HOURS" ? hours : units;
  const maximum = limits.measure === "HOURS" ? Math.min(limits.maximum, me.maxHours) : limits.maximum;
  const sections = new Map(classes.map((c) => [c.section.id, c.section]));
  const prevHours = prev && prevClasses.length ? round1(prevClasses.reduce((s, c) => s + c.endMin - c.startMin, 0) / 60) : null;

  // Department average from aggregated loads only.
  const deptLoads = loadReport(department.faculty.filter((f) => f.teachingLevels.includes(term.level)), department.assignments, department.limits);
  const deptAverage = deptLoads.length ? round1(deptLoads.reduce((s, r) => s + r.load, 0) / deptLoads.length) : 0;

  const mine = plan.sessions.filter((s) => s.facultyId === facultyId);
  const label = (scheduleId: string) => plan.label({ scheduleId });
  const byDay = HEATMAP_DAYS.map((d) => ({ day: DAY_LONG[d], hours: round1(classes.filter((c) => c.dayOfWeek === d).reduce((s, c) => s + c.endMin - c.startMin, 0) / 60) }));
  const roomHours = new Map<string, number>();
  for (const c of classes) roomHours.set(c.room.roomName, (roomHours.get(c.room.roomName) ?? 0) + (c.endMin - c.startMin) / 60);

  const unit = limits.measure === "HOURS" ? "hours" : "units";
  return {
    term: { id: term.id, label: `${levelLabel(term.level)} ${termLabel(term.type)} ${term.academicYear.name}` },
    name: me.fullName,
    department: me.department?.name ?? "No department",
    previousLabel: prev ? `${termLabel(prev.type)} ${prev.academicYear.name}` : null,
    load: { value: load, hours, units, minimum: limits.minimum, maximum, measure: limits.measure, unit, status: statusOf(load, limits.minimum, maximum) },
    hoursChange: countChange(hours, prevHours),
    counts: { subjects: new Set(classes.map((c) => c.subjectId)).size, sections: sections.size, students: [...sections.values()].reduce((s, x) => s + x.studentCount, 0) },
    utilization: me.maxHours ? round1((hours / me.maxHours) * 100) : 0,
    maxHours: me.maxHours,
    today: mine.filter((s) => s.date === today).map((s) => ({ label: label(s.scheduleId), time: formatRange(s.startMin, s.endMin), room: plan.roomName.get(s.roomId) ?? "", changed: s.status !== "REGULAR" })),
    weekCount: mine.length,
    bookings: bookings.map((b) => ({ id: b.id, date: isoDate(b.date), time: formatRange(b.startMin, b.endMin), room: b.room.roomName, purpose: b.purpose })),
    changes: {
      count: adjustments.length + fixes,
      recent: adjustments.slice(0, 5).map((a) => ({
        id: a.id,
        label: `${a.schedule.subject.code} ${a.schedule.section.name}`,
        date: isoDate(a.date),
        kind: a.kind === "MOVED" ? (a.facultyId === facultyId ? "You are covering this class" : "Moved") : a.kind === "CANCELLED" ? "Cancelled" : "Make-up class",
        reason: a.reason,
      })),
    },
    byDay,
    timetable: classes.map((c) => ({
      id: c.id, dayOfWeek: c.dayOfWeek, startMin: c.startMin, endMin: c.endMin,
      title: `${c.subject.code} ${c.section.name}`, detail: `${c.room.roomName} · ${c.component === "LABORATORY" ? "Laboratory" : "Lecture"}`,
    })),
    comparison: [
      { name: "My load", value: load },
      { name: "Department average", value: deptAverage },
      { name: "Minimum allowed", value: limits.minimum },
      { name: "Maximum allowed", value: maximum },
    ],
    heatmap: peakHeatmap(classes),
    rooms: [...roomHours.entries()].map(([name, h]) => ({ name, hours: round1(h) })).sort((a, b) => b.hours - a.hours).slice(0, 5),
    notifications: notifications.map((n) => ({
      id: n.id,
      kind: NOTIFICATION_KINDS.find((k) => k.titles.includes(n.title))?.kind ?? "Update",
      title: n.title,
      message: n.message,
      at: n.createdAt.toISOString(),
      isRead: n.isRead,
    })),
    upcoming: [
      ...exams.map((e) => ({
        id: `exam-${e.id}`, kind: e.proctorId === facultyId ? "Examination (proctor)" : "Examination (my class)", date: isoDate(e.date), endDate: isoDate(e.date),
        startMin: e.startMin as number | null, endMin: e.endMin as number | null, title: `${e.subject.code} ${e.section.name}`, detail: e.room.roomName,
      })),
      ...activities.map((a) => ({
        id: `activity-${a.id}`, kind: a.type === "HOLIDAY" ? "Holiday" : a.type === "CLASS_SUSPENSION" ? "Class suspension" : "School event",
        date: isoDate(a.startDate), endDate: isoDate(a.endDate), startMin: a.startMin, endMin: a.endMin, title: a.title, detail: a.description ?? "",
      })),
    ].sort((x, y) => x.date.localeCompare(y.date) || (x.startMin ?? 0) - (y.startMin ?? 0)),
  };
}

export type FacultyAnalytics = Awaited<ReturnType<typeof facultyAnalytics>>;

/** The term a faculty member's dashboard opens on: the active term where they teach most, else any active term. */
export async function defaultTermFor(facultyId: string | null) {
  const active = await prisma.semester.findMany({ where: { isActive: true }, select: { id: true, level: true } });
  if (facultyId) {
    const counts = await prisma.schedule.groupBy({ by: ["semesterId"], where: { facultyId, semesterId: { in: active.map((t) => t.id) } }, _count: true });
    const best = counts.sort((a, b) => b._count - a._count)[0];
    if (best) return best.semesterId;
  }
  return active.find((t) => t.level === "COLLEGE")?.id ?? active[0]?.id ?? null;
}
