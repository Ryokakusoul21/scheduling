import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/db/prisma";
import { requireStudent } from "@/lib/auth/session";
import { addDays, isoDate } from "@/lib/occupancy/engine";
import { manilaNow } from "./format";
import { stageLabel } from "@/lib/academics/levels";
import { activeTermLabel } from "@/lib/academics/term-label";

export const ROOM_TYPES: Record<string, string> = {
  LECTURE_ROOM: "Lecture room",
  COMPUTER_LABORATORY: "Computer laboratory",
  SCIENCE_LABORATORY: "Science laboratory",
  CONFERENCE_ROOM: "Conference room",
  OTHER: "Other",
};

/** One published class meeting of the student's section, safe to pass to client components. */
export interface PortalClass {
  id: string;
  dayOfWeek: string;
  startMin: number;
  endMin: number;
  component: "LECTURE" | "LABORATORY";
  subjectCode: string;
  subjectName: string;
  units: number;
  faculty: string;
  facultyEmail: string;
  room: string | null;
  roomType: string | null;
  building: string | null;
  buildingLocation: string | null;
  floor: string | null;
}

/** A class meeting of the student's section that was moved or taken online, within the next two weeks. */
export interface PortalMove {
  id: string;
  subjectCode: string;
  subjectName: string;
  /** The regular meeting date that changed. */
  date: string;
  /** The new date when the class moved to another day. */
  newDate: string | null;
  kind: "MOVED" | "ONLINE";
  /** Where it meets now; null when held online. */
  room: string | null;
  startMin: number;
  endMin: number;
  fromRoom: string | null;
  fromStartMin: number;
  fromEndMin: number;
  /** A general reason; internal details such as why a room was needed are not shown to students. */
  reason: string;
}

const MOVE_REASONS: Record<string, string> = {
  ROOM_BOOKING: "The room was needed for an urgent activity.",
  FACULTY_UNAVAILABLE: "Your teacher is unavailable at the usual time.",
  ROOM_UNAVAILABLE: "The room is not available.",
  CLASS_SUSPENSION: "Classes were suspended.",
};

export interface PortalActivity {
  id: string;
  type: string;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  startMin: number | null;
  endMin: number | null;
}

/** The signed-in student's own portal data; every query is scoped through the student's record, never by a client-supplied id. */
export const loadStudentPortal = cache(async () => {
  const user = await requireStudent();
  const student = await prisma.student.findUnique({
    where: { userId: user.id },
    select: {
      studentNumber: true,
      section: {
        select: {
          id: true,
          name: true,
          level: true,
          yearLevel: true,
          gradeLevel: true,
          program: { select: { code: true, name: true } },
          semester: { select: { name: true, startDate: true, endDate: true, academicYear: { select: { name: true } } } },
        },
      },
    },
  });
  const base = { user: { name: user.name ?? "", email: user.email ?? "" }, studentNumber: student?.studentNumber ?? "" };
  const section = student?.section;
  if (!section) return { ...base, section: null };

  // Basic-education sections have no semester of their own; they follow the active terms of their level.
  const levelTerms = section.semester
    ? [section.semester]
    : await prisma.semester.findMany({ where: { isActive: true, level: section.level }, select: { startDate: true, endDate: true } });
  const term = section.semester ? `${section.semester.academicYear.name} · ${section.semester.name}` : await activeTermLabel(section.level);
  const from = new Date(Math.min(...levelTerms.map((t) => t.startDate.getTime())));
  const to = new Date(Math.max(...levelTerms.map((t) => t.endDate.getTime())));

  const [schedules, activities] = await Promise.all([
    prisma.schedule.findMany({
      where: { sectionId: section.id, status: "PUBLISHED" },
      select: {
        id: true,
        dayOfWeek: true,
        startMin: true,
        endMin: true,
        component: true,
        subject: { select: { code: true, name: true, units: true } },
        faculty: { select: { fullName: true, email: true } },
        room: { select: { roomName: true, roomType: true, floor: { select: { name: true, building: { select: { name: true, location: true } } } } } },
      },
    }),
    levelTerms.length === 0
      ? []
      : prisma.activity.findMany({
          where: {
            // Only approved activities reach students; pending or rejected submissions stay private.
            status: "APPROVED",
            startDate: { lte: to },
            endDate: { gte: from },
            // Suspensions for other sections are not shown.
            OR: [{ type: { not: "CLASS_SUSPENSION" } }, { sectionIds: { isEmpty: true } }, { sectionIds: { has: section.id } }],
          },
          orderBy: { startDate: "asc" },
          select: { id: true, type: true, title: true, description: true, startDate: true, endDate: true, startMin: true, endMin: true },
        }),
  ]);

  // Moves and online meetings in the next two weeks; undone changes are left out, and the reason is a general one.
  const today = manilaNow().date;
  const horizon = addDays(today, 14);
  const adjustments = await prisma.scheduleAdjustment.findMany({
    where: {
      schedule: { sectionId: section.id, status: "PUBLISHED" },
      kind: { in: ["MOVED", "ONLINE"] },
      batch: { undoneAt: null },
      OR: [
        { date: { gte: new Date(`${today}T00:00:00Z`), lte: new Date(`${horizon}T00:00:00Z`) } },
        { newDate: { gte: new Date(`${today}T00:00:00Z`), lte: new Date(`${horizon}T00:00:00Z`) } },
      ],
    },
    orderBy: { date: "asc" },
    select: {
      id: true, kind: true, date: true, newDate: true, roomId: true, startMin: true, endMin: true,
      batch: { select: { cause: true } },
      schedule: { select: { startMin: true, endMin: true, subject: { select: { code: true, name: true } }, room: { select: { roomName: true } } } },
    },
  });
  const movedRooms = new Map(
    (await prisma.room.findMany({ where: { id: { in: adjustments.map((a) => a.roomId).filter((id): id is string => !!id) } }, select: { id: true, roomName: true } })).map((r) => [r.id, r.roomName])
  );
  const moves: PortalMove[] = adjustments.map((a) => ({
    id: a.id,
    subjectCode: a.schedule.subject.code,
    subjectName: a.schedule.subject.name,
    date: isoDate(a.date),
    newDate: a.newDate ? isoDate(a.newDate) : null,
    kind: a.kind as PortalMove["kind"],
    room: a.kind === "ONLINE" ? null : (a.roomId ? movedRooms.get(a.roomId) : a.schedule.room?.roomName) ?? null,
    startMin: a.startMin ?? a.schedule.startMin,
    endMin: a.endMin ?? a.schedule.endMin,
    fromRoom: a.schedule.room?.roomName ?? null,
    fromStartMin: a.schedule.startMin,
    fromEndMin: a.schedule.endMin,
    reason: MOVE_REASONS[a.batch.cause] ?? "The schedule was adjusted.",
  }));

  const classes: PortalClass[] = schedules.map((c) => ({
    id: c.id,
    dayOfWeek: c.dayOfWeek,
    startMin: c.startMin,
    endMin: c.endMin,
    component: c.component as PortalClass["component"],
    subjectCode: c.subject.code,
    subjectName: c.subject.name,
    units: c.subject.units,
    faculty: c.faculty.fullName,
    facultyEmail: c.faculty.email,
    room: c.room?.roomName ?? null,
    roomType: c.room ? (ROOM_TYPES[c.room.roomType] ?? c.room.roomType) : null,
    building: c.room?.floor?.building.name ?? null,
    buildingLocation: c.room?.floor?.building.location ?? null,
    floor: c.room?.floor?.name ?? null,
  }));
  const portalActivities: PortalActivity[] = activities.map((a) => ({
    ...a,
    description: a.description ?? "",
    startDate: isoDate(a.startDate),
    endDate: isoDate(a.endDate),
  }));

  return {
    ...base,
    term,
    classes,
    moves,
    activities: portalActivities,
    section: {
      name: section.name,
      program: section.program ? `${section.program.code} - ${section.program.name}` : null,
      stage: stageLabel(section),
    },
  };
});

export type StudentPortal = Awaited<ReturnType<typeof loadStudentPortal>>;
