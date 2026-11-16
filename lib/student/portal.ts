import { roomLabel } from "@/lib/rooms/label";
import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/db/prisma";
import { requireStudent } from "@/lib/auth/session";
import { isoDate } from "@/lib/occupancy/engine";
import { upcomingClassMoves, type ClassMove } from "@/lib/scheduler/class-moves";
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
export type PortalMove = ClassMove;

export interface PortalActivity {
  id: string;
  type: string;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  startMin: number | null;
  endMin: number | null;
  scheduleIds?: string[];
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
  const base = { user: { name: user.name ?? "", email: user.email ?? "", image: user.image ?? null }, studentNumber: student?.studentNumber ?? "" };
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
        room: { select: { roomNumber: true, roomName: true, roomType: true, floor: { select: { name: true, building: { select: { name: true, location: true } } } } } },
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
            OR: [{ sectionIds: { isEmpty: true } }, { sectionIds: { has: section.id } }],
          },
          orderBy: { startDate: "asc" },
          select: { id: true, type: true, title: true, description: true, startDate: true, endDate: true, startMin: true, endMin: true, batch: { select: { adjustments: { select: { scheduleId: true } } } } },
        }),
  ]);

  const moves = await upcomingClassMoves({ sectionId: section.id });

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
    room: roomLabel(c.room) || null,
    roomType: c.room ? (ROOM_TYPES[c.room.roomType] ?? c.room.roomType) : null,
    building: c.room?.floor?.building.name ?? null,
    buildingLocation: c.room?.floor?.building.location ?? null,
    floor: c.room?.floor?.name ?? null,
  }));
  const portalActivities: PortalActivity[] = activities.map(({ batch, ...a }) => ({
    ...a,
    scheduleIds: [...new Set(batch?.adjustments.map((item) => item.scheduleId) ?? [])],
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
