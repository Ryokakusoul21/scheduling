import { roomLabel } from "@/lib/rooms/label";
import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { addDays, isoDate } from "@/lib/occupancy/engine";
import { manilaNow } from "@/lib/student/format";

/** A published class meeting that was moved or taken online, within the next two weeks. */
export interface ClassMove {
  id: string;
  scheduleId?: string;
  subjectCode: string;
  subjectName: string;
  section?: string;
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
  /** A general reason; internal details such as why a room was needed are not shown. */
  reason: string;
  meetingLink?: string | null;
  instructions?: string | null;
}

const MOVE_REASONS: Record<string, string> = {
  ROOM_BOOKING: "The room was needed for an urgent activity.",
  FACULTY_UNAVAILABLE: "Your teacher is unavailable at the usual time.",
  ROOM_UNAVAILABLE: "The room is not available.",
  CLASS_SUSPENSION: "Classes were suspended.",
};

/** Moves and online meetings of the matching published classes in the next two weeks; undone changes are left out. */
export async function upcomingClassMoves(schedule: Prisma.ScheduleWhereInput, viewer: "student" | "faculty" = "student"): Promise<ClassMove[]> {
  const reasons = viewer === "faculty" ? { ...MOVE_REASONS, FACULTY_UNAVAILABLE: "You are unavailable at the usual time." } : MOVE_REASONS;
  const today = manilaNow().date;
  const range = { gte: new Date(`${today}T00:00:00Z`), lte: new Date(`${addDays(today, 14)}T00:00:00Z`) };
  const adjustments = await prisma.scheduleAdjustment.findMany({
    where: { schedule: { ...schedule, status: "PUBLISHED" }, kind: { in: ["MOVED", "ONLINE"] }, batch: { undoneAt: null }, OR: [{ date: range }, { newDate: range }] },
    orderBy: { date: "asc" },
    select: {
      id: true, scheduleId: true, kind: true, date: true, newDate: true, roomId: true, startMin: true, endMin: true,
      batch: { select: { cause: true, activity: { select: { location: true, description: true } } } },
      schedule: { select: { startMin: true, endMin: true, subject: { select: { code: true, name: true } }, section: { select: { name: true } }, room: { select: { roomNumber: true, roomName: true } } } },
    },
  });
  const rooms = new Map(
    (await prisma.room.findMany({ where: { id: { in: adjustments.map((a) => a.roomId).filter((id): id is string => !!id) } }, select: { id: true, roomNumber: true, roomName: true } })).map((r) => [r.id, roomLabel(r)])
  );
  return adjustments.map((a) => {
    const virtual = a.kind === "ONLINE" && a.batch.cause === "CLASS_SUSPENSION";
    return {
      id: a.id,
      scheduleId: a.scheduleId,
      subjectCode: a.schedule.subject.code,
      subjectName: a.schedule.subject.name,
      section: a.schedule.section.name,
      date: isoDate(a.date),
      newDate: a.newDate ? isoDate(a.newDate) : null,
      kind: a.kind as ClassMove["kind"],
      room: a.kind === "ONLINE" ? null : (a.roomId ? rooms.get(a.roomId) : roomLabel(a.schedule.room)) || null,
      startMin: a.startMin ?? a.schedule.startMin,
      endMin: a.endMin ?? a.schedule.endMin,
      fromRoom: roomLabel(a.schedule.room) || null,
      fromStartMin: a.schedule.startMin,
      fromEndMin: a.schedule.endMin,
      reason: virtual ? "This class continues virtually at its original time." : reasons[a.batch.cause] ?? "The schedule was adjusted.",
      meetingLink: virtual && a.batch.activity?.location?.startsWith("https://") ? a.batch.activity.location : null,
      instructions: virtual ? a.batch.activity?.description ?? null : null,
    };
  });
}
