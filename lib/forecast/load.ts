import "server-only";
import { prisma } from "@/lib/db/prisma";
import { getWorkloadSettings } from "@/lib/settings";
import { levelLabel, termLabel } from "@/lib/academics/levels";
import { facultyNeeded, gap, needsFor, predict, roomsNeeded, type HistoryPoint, type Prediction } from "./forecast";

export const ROOM_WEEKLY_HOURS = 72;
export const TARGET_ROOM_UTILIZATION = 0.75;
const DEFAULT_HOURS: Record<string, number> = { COLLEGE: 20, SENIOR_HIGH: 25, JUNIOR_HIGH: 30, ELEMENTARY: 25 };
const DEFAULT_SECTION_SIZE = 40;

export interface SeriesForecast {
  key: string;
  name: string;
  level: string;
  departmentId: string | null;
  departmentName: string;
  history: { label: string; year: number; termType: string; enrolled: number }[];
  lastActual: number | null;
  prediction: Prediction | null;
  sectionSize: number;
  hoursPerSection: number;
  laboratoryShare: number;
  assumedDefaults: boolean;
  sectionsNeeded: number;
  sectionsNow: number;
  sectionGap: ReturnType<typeof gap>;
  lectureHours: number;
  laboratoryHours: { computer: number; science: number };
}

/** The next two terms after the latest recorded enrollment. */
export function upcomingTerms(records: { academicYear: string; termType: string }[]) {
  const latestYear = Math.max(...records.map((r) => Number(r.academicYear.slice(0, 4))));
  const hasSecond = records.some((r) => Number(r.academicYear.slice(0, 4)) === latestYear && r.termType === "SECOND");
  const next = hasSecond ? { year: latestYear + 1, termType: "FIRST" } : { year: latestYear, termType: "SECOND" };
  const after = next.termType === "FIRST" ? { year: next.year, termType: "SECOND" } : { year: next.year + 1, termType: "FIRST" };
  return [next, after].map((t) => ({ ...t, value: `${t.year}-${t.termType}`, label: `${termLabel(t.termType)} ${t.year}-${t.year + 1}` }));
}

export async function loadForecast(target: { year: number; termType: string }, departmentId: string | null) {
  const [records, programs, departments, sections, schedules, faculty, rooms, settings] = await Promise.all([
    prisma.enrollmentRecord.findMany(),
    prisma.program.findMany({ include: { department: { select: { name: true } } } }),
    prisma.department.findMany({ select: { id: true, name: true } }),
    prisma.section.findMany({ where: { OR: [{ semester: { isActive: true } }, { semesterId: null }] }, select: { id: true, level: true, programId: true, studentCount: true } }),
    prisma.schedule.findMany({
      where: { semester: { isActive: true }, status: { not: "ARCHIVED" } },
      select: { sectionId: true, component: true, startMin: true, endMin: true, room: { select: { roomType: true } } },
    }),
    prisma.faculty.findMany({ where: { status: "ACTIVE" }, select: { departmentId: true } }),
    prisma.room.findMany({ where: { status: "AVAILABLE" }, select: { roomType: true, departmentId: true } }),
    getWorkloadSettings(),
  ]);

  // Basic education levels without programs belong to the department that runs Senior High School.
  const basicDepartment = programs.find((p) => p.level === "SENIOR_HIGH")?.departmentId ?? null;
  const seriesKey = (level: string, programId: string | null) => `${level}|${programId ?? ""}`;
  const keys = [...new Set(records.map((r) => seriesKey(r.level, r.programId)))];

  const school = { lab: 0, total: 0, computer: 0 };
  for (const s of schedules) {
    const h = (s.endMin - s.startMin) / 60;
    school.total += h;
    if (s.component === "LABORATORY") {
      school.lab += h;
      if (s.room.roomType === "COMPUTER_LABORATORY") school.computer += h;
    }
  }

  const series: SeriesForecast[] = keys.map((key) => {
    const [level, programId] = key.split("|");
    const program = programs.find((p) => p.id === programId);
    const deptId = program?.departmentId ?? (level === "COLLEGE" ? null : basicDepartment);
    const history: HistoryPoint[] = records
      .filter((r) => seriesKey(r.level, r.programId) === key)
      .map((r) => ({ year: Number(r.academicYear.slice(0, 4)), termType: r.termType, enrolled: r.enrolled }))
      .sort((a, b) => a.year - b.year || a.termType.localeCompare(b.termType));

    const mySections = sections.filter((s) => s.level === level && (s.programId ?? "") === programId);
    const myMeetings = schedules.filter((s) => mySections.some((x) => x.id === s.sectionId));
    const scheduledSections = new Set(myMeetings.map((m) => m.sectionId)).size;
    const hours = myMeetings.reduce((s, m) => s + (m.endMin - m.startMin) / 60, 0);
    const lab = myMeetings.filter((m) => m.component === "LABORATORY");
    const labHours = lab.reduce((s, m) => s + (m.endMin - m.startMin) / 60, 0);
    const computerHours = lab.filter((m) => m.room.roomType === "COMPUTER_LABORATORY").reduce((s, m) => s + (m.endMin - m.startMin) / 60, 0);

    // Partial timetables would understate need, so observed hours count only when at least half the usual load.
    const observed = scheduledSections > 0 && hours / scheduledSections >= DEFAULT_HOURS[level] / 2;
    const sectionSize = mySections.length ? Math.round(mySections.reduce((s, x) => s + x.studentCount, 0) / mySections.length) : DEFAULT_SECTION_SIZE;
    const hoursPerSection = observed ? Math.round((hours / scheduledSections) * 10) / 10 : DEFAULT_HOURS[level];
    const laboratoryShare = observed && hours ? labHours / hours : school.total ? school.lab / school.total : 0.2;
    const computerShare = labHours ? computerHours / labHours : school.lab ? school.computer / school.lab : 0.5;

    const prediction = predict(history, target.year, target.termType);
    const needs = needsFor(prediction?.value ?? 0, { sectionSize, hoursPerSection, laboratoryShare });
    const last = history.at(-1);
    return {
      key,
      name: program ? `${program.name} (${program.code})` : levelLabel(level),
      level,
      departmentId: deptId,
      departmentName: departments.find((d) => d.id === deptId)?.name ?? "No department",
      history: history.map((h) => ({ ...h, label: `${termLabel(h.termType)} ${h.year}-${h.year + 1}` })),
      lastActual: last?.enrolled ?? null,
      prediction,
      sectionSize,
      hoursPerSection,
      laboratoryShare: Math.round(laboratoryShare * 100) / 100,
      assumedDefaults: !observed,
      sectionsNeeded: needs.sections,
      sectionsNow: mySections.length,
      sectionGap: gap(needs.sections, mySections.length),
      lectureHours: needs.lectureHours,
      laboratoryHours: { computer: Math.round(needs.laboratoryHours * computerShare), science: Math.round(needs.laboratoryHours * (1 - computerShare)) },
    };
  });

  const visible = series.filter((s) => !departmentId || s.departmentId === departmentId);
  const loadPerFaculty = settings.measure === "HOURS" ? settings.maximum : 24;

  const facultyRows = departments
    .filter((d) => !departmentId || d.id === departmentId)
    .map((d) => {
      const hours = visible.filter((s) => s.departmentId === d.id).reduce((t, s) => t + s.lectureHours + s.laboratoryHours.computer + s.laboratoryHours.science, 0);
      const needed = facultyNeeded(hours, loadPerFaculty);
      const now = faculty.filter((f) => f.departmentId === d.id).length;
      return { id: d.id, name: d.name, hours, needed, now, ...gap(needed, now) };
    })
    .filter((r) => r.hours > 0 || r.now > 0);

  const total = (pick: (s: SeriesForecast) => number) => visible.reduce((t, s) => t + pick(s), 0);
  const roomPool = rooms.filter((r) => !departmentId || r.departmentId === departmentId || r.departmentId === null);
  const roomRows = [
    { type: "Lecture rooms", hours: total((s) => s.lectureHours), now: roomPool.filter((r) => r.roomType === "LECTURE_ROOM").length },
    { type: "Computer laboratories", hours: total((s) => s.laboratoryHours.computer), now: roomPool.filter((r) => r.roomType === "COMPUTER_LABORATORY").length },
    { type: "Science laboratories", hours: total((s) => s.laboratoryHours.science), now: roomPool.filter((r) => r.roomType === "SCIENCE_LABORATORY").length },
  ].map((r) => {
    const needed = roomsNeeded(r.hours, ROOM_WEEKLY_HOURS, TARGET_ROOM_UTILIZATION);
    return { ...r, needed, ...gap(needed, r.now) };
  });

  return {
    series: visible,
    facultyRows,
    roomRows,
    departments,
    assumptions: {
      loadPerFaculty,
      roomWeeklyHours: ROOM_WEEKLY_HOURS,
      targetUtilization: TARGET_ROOM_UTILIZATION,
    },
  };
}
