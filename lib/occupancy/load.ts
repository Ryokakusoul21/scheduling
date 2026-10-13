import "server-only";
import type { RoomType } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  addDays,
  expandSessions,
  isoDate,
  sessionOccupant,
  type DatedAdjustment,
  type Occupant,
  type PlanContext,
  type Session,
  type WeeklyClass,
} from "./engine";

export interface ClassInfo {
  subjectCode: string;
  subjectName: string;
  sectionName: string;
  departmentId: string | null;
}

export interface LoadedPlan {
  ctx: PlanContext;
  sessions: Session[];
  classInfo: Map<string, ClassInfo>;
  roomName: Map<string, string>;
  facultyName: Map<string, string>;
  label: (s: Pick<Session, "scheduleId">) => string;
}

/**
 * Loads everything that occupies rooms, faculty, and sections between two dates
 * (classes with their adjustments, examinations, bookings) plus holidays and unavailability.
 */
export async function loadPlan(from: string, to: string, opts: { excludeBatchId?: string } = {}): Promise<LoadedPlan> {
  const wideFrom = new Date(`${addDays(from, -7)}T00:00:00Z`);
  const wideTo = new Date(`${addDays(to, 7)}T00:00:00Z`);
  const rangeFrom = new Date(`${from}T00:00:00Z`);
  const rangeTo = new Date(`${to}T00:00:00Z`);
  const activeBatch = { undoneAt: null, ...(opts.excludeBatchId ? { NOT: { id: opts.excludeBatchId } } : {}) };

  const terms = await prisma.semester.findMany({
    where: { startDate: { lte: wideTo }, endDate: { gte: wideFrom } },
    select: { id: true, startDate: true, endDate: true },
  });

  const [schedules, adjustments, holidays, exams, bookings, rooms, faculty, unavailable, sections, subjects] = await Promise.all([
    prisma.schedule.findMany({
      where: { semesterId: { in: terms.map((t) => t.id) }, status: { not: "ARCHIVED" } },
      include: {
        subject: { select: { code: true, name: true } },
        section: { select: { name: true, program: { select: { departmentId: true } } } },
      },
    }),
    prisma.scheduleAdjustment.findMany({
      where: { batch: activeBatch, OR: [{ date: { gte: wideFrom, lte: wideTo } }, { newDate: { gte: wideFrom, lte: wideTo } }] },
    }),
    prisma.activity.findMany({
      where: { type: "HOLIDAY", startDate: { lte: wideTo }, endDate: { gte: wideFrom } },
      select: { startDate: true, endDate: true },
    }),
    prisma.examination.findMany({
      where: { date: { gte: rangeFrom, lte: rangeTo } },
      include: { subject: { select: { code: true } }, section: { select: { name: true } } },
    }),
    prisma.roomBooking.findMany({ where: { status: "CONFIRMED", date: { gte: rangeFrom, lte: rangeTo } } }),
    prisma.room.findMany({ include: { floor: { select: { buildingId: true } } } }),
    prisma.faculty.findMany({ where: { status: "ACTIVE" }, include: { availability: true } }),
    prisma.unavailability.findMany({ where: { status: { not: "DISMISSED" }, startDate: { lte: wideTo }, endDate: { gte: wideFrom } } }),
    prisma.section.findMany({ select: { id: true, studentCount: true, level: true } }),
    prisma.subject.findMany({ select: { id: true, requiredRoomType: true } }),
  ]);

  const holidaySet = new Set<string>();
  for (const h of holidays) for (let d = isoDate(h.startDate); d <= isoDate(h.endDate); d = addDays(d, 1)) holidaySet.add(d);

  const classes: WeeklyClass[] = schedules.map((s) => ({
    id: s.id, semesterId: s.semesterId, sectionId: s.sectionId, subjectId: s.subjectId, facultyId: s.facultyId,
    roomId: s.roomId, component: s.component, dayOfWeek: s.dayOfWeek, startMin: s.startMin, endMin: s.endMin,
  }));
  const dated: DatedAdjustment[] = adjustments.map((a) => ({
    scheduleId: a.scheduleId, date: isoDate(a.date), kind: a.kind, newDate: a.newDate ? isoDate(a.newDate) : null,
    roomId: a.roomId, facultyId: a.facultyId, startMin: a.startMin, endMin: a.endMin, reason: a.reason,
  }));
  const sessions = expandSessions(
    classes,
    terms.map((t) => ({ id: t.id, start: isoDate(t.startDate), end: isoDate(t.endDate) })),
    dated,
    from,
    to,
    holidaySet
  );

  const classInfo = new Map<string, ClassInfo>(
    schedules.map((s) => [s.id, { subjectCode: s.subject.code, subjectName: s.subject.name, sectionName: s.section.name, departmentId: s.section.program?.departmentId ?? null }])
  );
  const label = (s: Pick<Session, "scheduleId">) => {
    const c = classInfo.get(s.scheduleId);
    return c ? `${c.subjectCode} ${c.sectionName}` : "Class";
  };

  const occupants: Occupant[] = [
    ...sessions.map((s) => sessionOccupant(s, label(s))),
    ...exams.map((e) => ({
      kind: "EXAMINATION" as const, refId: e.id, date: isoDate(e.date), startMin: e.startMin, endMin: e.endMin, roomId: e.roomId,
      facultyIds: [e.proctorId], sectionIds: [e.sectionId], label: `Examination: ${e.subject.code} ${e.section.name}`,
    })),
    ...bookings.map((b) => ({
      kind: "BOOKING" as const, refId: b.id, date: isoDate(b.date), startMin: b.startMin, endMin: b.endMin, roomId: b.roomId,
      facultyIds: [], sectionIds: [], label: `Room booking: ${b.purpose}`,
    })),
  ];

  const ctx: PlanContext = {
    rooms: rooms.map((r) => ({ id: r.id, name: r.roomName, capacity: r.capacity, roomType: r.roomType, status: r.status, buildingId: r.floor?.buildingId ?? null })),
    faculty: new Map(
      faculty.map((f) => [
        f.id,
        { id: f.id, name: f.fullName, departmentId: f.departmentId, teachingLevels: f.teachingLevels, availability: f.availability.map((a) => ({ dayOfWeek: a.dayOfWeek, startMin: a.startMin, endMin: a.endMin })) },
      ])
    ),
    occupants,
    unavailable: unavailable.map((u) => ({ facultyId: u.facultyId, roomId: u.roomId, start: isoDate(u.startDate), end: isoDate(u.endDate), startMin: u.startMin, endMin: u.endMin })),
    holidays: holidaySet,
    sectionSize: new Map(sections.map((s) => [s.id, s.studentCount])),
    sectionLevel: new Map(sections.map((s) => [s.id, s.level])),
    subjectRoomType: new Map(subjects.map((s) => [s.id, s.requiredRoomType as RoomType])),
  };

  return {
    ctx,
    sessions,
    classInfo,
    roomName: new Map(rooms.map((r) => [r.id, r.roomName])),
    facultyName: new Map(faculty.map((f) => [f.id, f.fullName])),
    label,
  };
}
