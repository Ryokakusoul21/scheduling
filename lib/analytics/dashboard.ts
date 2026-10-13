import "server-only";
import type { Semester } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { levelLabel, termLabel } from "@/lib/academics/levels";
import { isoDate } from "@/lib/occupancy/engine";
import { detectConflictsForTerms } from "@/lib/scheduler/term-conflicts";
import { isOverlapConflict } from "@/lib/scheduler/conflictDetector";
import { predict, type HistoryPoint } from "@/lib/forecast/forecast";
import { loadWorkload } from "@/lib/workload/load";
import { loadReport, type LoadStatus } from "@/lib/workload/optimizer";
import { byGroup, facultyUtilization, overall, peakHeatmap, roomUtilization, type RateRow } from "./timetable";
import { countChange, extremes, rateChange, weeklyCounts, type Change } from "./trends";

/** Weekly hours a room is open when it has no availability windows: Monday to Saturday, 7:00 AM to 7:00 PM. */
const DEFAULT_ROOM_HOURS = 72;

export interface DashboardFilters {
  termId: string;
  departmentId: string | null;
  buildingId: string | null;
}

export interface Card {
  key: string;
  label: string;
  value: string;
  raw: number;
  change: Change;
  hint: string;
}

const pctText = (n: number) => `${n}%`;

/** Figures for one term under the filters; also used for the previous semester comparison. */
async function termFigures(term: Semester, f: DashboardFilters) {
  const inDept = f.departmentId ? { section: { program: { departmentId: f.departmentId } } } : {};
  const inBuilding = f.buildingId ? { room: { floor: { buildingId: f.buildingId } } } : {};
  const academicYear = await prisma.academicYear.findUnique({ where: { id: term.academicYearId }, select: { name: true } });
  const [schedules, rooms, facultyRows, records, programs, termSections, conflicts, workload] = await Promise.all([
    prisma.schedule.findMany({
      where: { semesterId: term.id, status: { not: "ARCHIVED" }, ...inDept, ...inBuilding },
      select: { id: true, roomId: true, facultyId: true, sectionId: true, dayOfWeek: true, startMin: true, endMin: true },
    }),
    prisma.room.findMany({
      where: f.buildingId ? { floor: { buildingId: f.buildingId } } : {},
      include: { availability: true, floor: { select: { building: { select: { name: true } } } } },
    }),
    prisma.faculty.findMany({ where: f.departmentId ? { departmentId: f.departmentId } : {}, include: { department: { select: { name: true } } } }),
    prisma.enrollmentRecord.findMany({
      where: { level: term.level, academicYear: academicYear?.name ?? "", termType: term.type.startsWith("QUARTER") ? "FIRST" : term.type },
    }),
    prisma.program.findMany({ select: { id: true, departmentId: true } }),
    prisma.section.findMany({ where: { semesterId: term.id, ...(f.departmentId ? { program: { departmentId: f.departmentId } } : {}) }, select: { id: true } }),
    detectConflictsForTerms([term.id]),
    loadWorkload([term.id], f.departmentId),
  ]);

  const deptOfProgram = new Map(programs.map((p) => [p.id, p.departmentId]));
  const students = records
    .filter((r) => !f.departmentId || (r.programId ? deptOfProgram.get(r.programId) === f.departmentId : false))
    .reduce((s, r) => s + r.enrolled, 0);

  const usedRooms = new Set(schedules.map((s) => s.roomId));
  const roomRows = roomUtilization(
    schedules,
    rooms
      .filter((r) => !f.departmentId || r.departmentId === f.departmentId || usedRooms.has(r.id))
      .map((r) => ({
        id: r.id,
        name: r.roomName,
        building: r.floor?.building.name ?? "No building",
        availableHours: r.availability.length ? r.availability.reduce((s, a) => s + a.endMin - a.startMin, 0) / 60 : DEFAULT_ROOM_HOURS,
      }))
  );

  // Faculty utilization counts every class a teacher has in the term; a building filter narrows it to those teaching there.
  const teaching = new Set(schedules.map((s) => s.facultyId));
  const inScopeFaculty = facultyRows.filter((x) => x.status === "ACTIVE" && x.teachingLevels.includes(term.level) && (!f.buildingId || teaching.has(x.id)));
  const scheduleIds = new Set(schedules.map((s) => s.id));
  const [allMeetings, resolved] = await Promise.all([
    prisma.schedule.findMany({
      where: { semesterId: term.id, status: { not: "ARCHIVED" }, facultyId: { in: inScopeFaculty.map((x) => x.id) } },
      select: { roomId: true, facultyId: true, dayOfWeek: true, startMin: true, endMin: true },
    }),
    prisma.scheduleAdjustment.findMany({
      where: { kind: "MOVED", batch: { undoneAt: null }, scheduleId: { in: [...scheduleIds] } },
      select: { date: true },
    }),
  ]);
  const facultyRowsRated = facultyUtilization(
    allMeetings,
    inScopeFaculty.map((x) => ({ id: x.id, name: x.fullName, department: x.department?.name ?? "No department", maxHours: x.maxHours }))
  );

  const openConflicts = conflicts
    .filter(isOverlapConflict)
    .filter((c) => scheduleIds.has(c.entryA.id ?? "") || (c.entryB && scheduleIds.has(c.entryB.id ?? ""))).length;

  // Loads cover faculty who teach this term's level (a college semester says nothing about basic education teachers).
  const { limits, faculty, assignments } = workload;
  const loads = loadReport(faculty.filter((x) => x.teachingLevels.includes(term.level) && (!f.buildingId || teaching.has(x.id))), assignments, limits);
  const loadCount = (s: LoadStatus) => loads.filter((l) => l.status === s).length;

  return {
    students,
    sections: new Set([...schedules.map((s) => s.sectionId), ...termSections.map((s) => s.id)]).size,
    faculty: teaching.size,
    rooms: usedRooms.size,
    roomRows,
    roomRate: overall(roomRows).rate,
    facultyRows: facultyRowsRated,
    facultyRate: overall(facultyRowsRated).rate,
    openConflicts,
    resolvedDates: resolved.map((r) => isoDate(r.date)),
    overloaded: loadCount("OVERLOADED"),
    underloaded: loadCount("UNDERLOADED"),
    balanced: loadCount("BALANCED"),
    schedules,
    hasData: schedules.length > 0,
  };
}

/** The previous term of the same level (and course, when the term belongs to one). */
async function previousTerm(term: Semester) {
  return prisma.semester.findFirst({
    where: { level: term.level, programId: term.programId, endDate: { lt: term.startDate } },
    include: { academicYear: { select: { name: true } } },
    orderBy: { endDate: "desc" },
  });
}

export async function dashboardAnalytics(f: DashboardFilters) {
  const term = await prisma.semester.findUniqueOrThrow({ where: { id: f.termId }, include: { academicYear: { select: { name: true } } } });
  const prev = await previousTerm(term);

  // Weekly room bookings and automatically resolved conflicts across the term, up to two weeks ahead.
  const start = isoDate(term.startDate);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
  const horizon = new Date(`${today}T00:00:00Z`);
  horizon.setUTCDate(horizon.getUTCDate() + 14);
  const end = [isoDate(term.endDate), isoDate(horizon)].sort()[0];

  const [now, before, bookings, enrollment, upcomingItems] = await Promise.all([
    termFigures(term, f),
    prev ? termFigures(prev, f) : Promise.resolve(null),
    prisma.roomBooking.findMany({
      where: {
        status: "CONFIRMED",
        date: { gte: term.startDate, lte: new Date(`${end}T00:00:00Z`) },
        ...(f.buildingId ? { room: { floor: { buildingId: f.buildingId } } } : {}),
        ...(f.departmentId ? { room: { departmentId: f.departmentId } } : {}),
      },
      select: { date: true },
    }),
    enrollmentTrend(term.level, f.departmentId),
    upcoming(f),
  ]);
  const p = before?.hasData ? before : null;
  const prevLabel = prev ? `${termLabel(prev.type)} ${prev.academicYear.name}` : null;

  const cards: Card[] = [
    { key: "students", label: "Students enrolled", value: now.students.toLocaleString(), raw: now.students, change: countChange(now.students, before?.students || null), hint: "From enrollment records for this term" },
    { key: "sections", label: "Sections", value: String(now.sections), raw: now.sections, change: countChange(now.sections, p?.sections ?? null), hint: "Sections with classes this term" },
    { key: "faculty", label: "Faculty teaching", value: String(now.faculty), raw: now.faculty, change: countChange(now.faculty, p?.faculty ?? null), hint: "Faculty with at least one class" },
    { key: "rooms", label: "Rooms in use", value: String(now.rooms), raw: now.rooms, change: countChange(now.rooms, p?.rooms ?? null), hint: "Rooms hosting at least one class" },
    { key: "roomRate", label: "Room Utilization Rate", value: pctText(now.roomRate), raw: now.roomRate, change: rateChange(now.roomRate, p?.roomRate ?? null), hint: "Scheduled hours over available room hours" },
    { key: "facultyRate", label: "Faculty Utilization Rate", value: pctText(now.facultyRate), raw: now.facultyRate, change: rateChange(now.facultyRate, p?.facultyRate ?? null), hint: "Teaching hours over maximum hours" },
    {
      key: "conflicts", label: "Conflicts detected and resolved", value: `${now.openConflicts + now.resolvedDates.length} detected · ${now.resolvedDates.length} resolved`,
      raw: now.resolvedDates.length, change: countChange(now.resolvedDates.length, p ? p.resolvedDates.length : null),
      hint: now.openConflicts ? `${now.openConflicts} still open` : "No open double bookings",
    },
    {
      key: "loads", label: "Overloaded and underloaded faculty", value: `${now.overloaded} overloaded · ${now.underloaded} underloaded`,
      raw: now.overloaded + now.underloaded, change: countChange(now.overloaded + now.underloaded, p ? p.overloaded + p.underloaded : null, false),
      hint: `${now.balanced} balanced`,
    },
  ];

  const roomMarks = extremes(now.roomRows);
  const rooms = now.roomRows.map((r, i) => ({ ...r, mark: i === roomMarks.most ? "MOST" : i === roomMarks.least ? "LEAST" : null }) as RateRow & { mark: "MOST" | "LEAST" | null });

  const weekly = weeklyCounts(start, end, { bookings: bookings.map((b) => isoDate(b.date)), resolved: now.resolvedDates.filter((d) => d <= end) });

  return {
    term: { id: term.id, label: `${levelLabel(term.level)} ${termLabel(term.type)} ${term.academicYear.name}` },
    previousLabel: prevLabel,
    previousHasData: !!p,
    cards,
    rooms,
    buildings: byGroup(now.roomRows),
    departments: byGroup(now.facultyRows),
    heatmap: peakHeatmap(now.schedules),
    loadDistribution: [
      { status: "UNDERLOADED" as const, count: now.underloaded },
      { status: "BALANCED" as const, count: now.balanced },
      { status: "OVERLOADED" as const, count: now.overloaded },
    ],
    weekly,
    enrollment,
    upcoming: upcomingItems,
  };
}

/** Total enrollment per past term for the level, plus a forecast for the next term. */
async function enrollmentTrend(level: Semester["level"], departmentId: string | null) {
  const [records, programs] = await Promise.all([
    prisma.enrollmentRecord.findMany({ where: { level } }),
    prisma.program.findMany({ select: { id: true, departmentId: true } }),
  ]);
  const dept = new Map(programs.map((p) => [p.id, p.departmentId]));
  const scoped = records.filter((r) => !departmentId || (r.programId && dept.get(r.programId) === departmentId));
  const order = (t: string) => (t === "SECOND" ? 1 : t === "SUMMER" ? 2 : 0);
  const totals = new Map<string, { year: number; termType: string; enrolled: number }>();
  for (const r of scoped) {
    const k = `${r.academicYear}|${r.termType}`;
    const t = totals.get(k) ?? { year: Number(r.academicYear.slice(0, 4)), termType: r.termType, enrolled: 0 };
    t.enrolled += r.enrolled;
    totals.set(k, t);
  }
  const points = [...totals.values()].sort((a, b) => a.year - b.year || order(a.termType) - order(b.termType));
  const last = points.at(-1);
  if (!last) return { points: [], forecast: null };

  const twoTerms = points.some((p) => p.termType === "SECOND");
  const next = twoTerms && last.termType === "FIRST" ? { year: last.year, termType: "SECOND" } : { year: last.year + 1, termType: "FIRST" };
  // Forecast each program separately, then add them up.
  const series = new Map<string, HistoryPoint[]>();
  for (const r of scoped) {
    const k = r.programId ?? "level";
    series.set(k, [...(series.get(k) ?? []), { year: Number(r.academicYear.slice(0, 4)), termType: r.termType, enrolled: r.enrolled }]);
  }
  const predictions = [...series.values()].map((h) => predict(h, next.year, next.termType)).filter(Boolean);
  const label = (p: { year: number; termType: string }) => `${termLabel(p.termType)} ${p.year}-${p.year + 1}`;
  return {
    points: points.map((p) => ({ label: label(p), enrolled: p.enrolled })),
    forecast: predictions.length
      ? {
          label: label(next),
          value: predictions.reduce((s, p) => s + p!.value, 0),
          low: predictions.reduce((s, p) => s + p!.low, 0),
          high: predictions.reduce((s, p) => s + p!.high, 0),
        }
      : null,
  };
}

/** Examinations and calendar activities in the next three weeks. */
async function upcoming(f: DashboardFilters) {
  const today = new Date(`${new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" })}T00:00:00Z`);
  const until = new Date(today);
  until.setUTCDate(until.getUTCDate() + 21);
  const [exams, activities] = await Promise.all([
    prisma.examination.findMany({
      where: {
        date: { gte: today, lte: until },
        ...(f.departmentId ? { section: { program: { departmentId: f.departmentId } } } : {}),
        ...(f.buildingId ? { room: { floor: { buildingId: f.buildingId } } } : {}),
      },
      include: { subject: { select: { code: true } }, section: { select: { name: true } }, room: { select: { roomName: true } }, proctor: { select: { fullName: true } } },
      orderBy: [{ date: "asc" }, { startMin: "asc" }],
      take: 12,
    }),
    prisma.activity.findMany({ where: { endDate: { gte: today }, startDate: { lte: until } }, orderBy: { startDate: "asc" }, take: 12 }),
  ]);
  return [
    ...exams.map((e) => ({
      id: `exam-${e.id}`, kind: "Examination", date: isoDate(e.date), endDate: isoDate(e.date), startMin: e.startMin as number | null, endMin: e.endMin as number | null,
      title: `${e.subject.code} ${e.section.name}`, detail: `${e.room.roomName} · Proctor: ${e.proctor.fullName}`,
    })),
    ...activities.map((a) => ({
      id: `activity-${a.id}`, kind: a.type === "HOLIDAY" ? "Holiday" : a.type === "CLASS_SUSPENSION" ? "Class suspension" : "School event",
      date: isoDate(a.startDate), endDate: isoDate(a.endDate), startMin: a.startMin, endMin: a.endMin, title: a.title, detail: a.description ?? "",
    })),
  ].sort((x, y) => x.date.localeCompare(y.date) || (x.startMin ?? 0) - (y.startMin ?? 0));
}

export type DashboardAnalytics = Awaited<ReturnType<typeof dashboardAnalytics>>;
