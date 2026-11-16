import "server-only";
import type { DayOfWeek, Prisma } from "@prisma/client";
import { checkEntry } from "@/lib/scheduler/constraints";
import { activeRules, loadContext } from "@/lib/scheduler/constraints-server";
import type { SchedEntry } from "@/lib/scheduler/types";

type Offering = { subjectId: string; sectionId: string | null; semesterId: string; facultyId: string };
type Tx = Prisma.TransactionClient;

const DAYS: DayOfWeek[] = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
const OPEN = 7 * 60, CLOSE = 21 * 60, STEP = 30;
const ENTRY = { id: true, semesterId: true, subjectId: true, sectionId: true, facultyId: true, roomId: true, component: true, dayOfWeek: true, startMin: true, endMin: true, deliveryMode: true } as const;
const toEntry = (s: Prisma.ScheduleGetPayload<{ select: typeof ENTRY }>): SchedEntry => ({ ...s, roomId: s.roomId ?? "", deliveryMode: s.deliveryMode === "ONLINE_LIVE" ? "ONLINE_LIVE" : "IN_PERSON" });

/**
 * Hands each offering's timetabled classes to its assigned teacher so the timetable follows Subject Assignments.
 * A class keeps its time when that passes every scheduling rule for the new teacher; otherwise it moves to the nearest
 * time (the same room first, then another of the same type) that passes them all. Classes with no such time are reported.
 */
export async function handOverClasses(tx: Tx, offerings: Offering[]) {
  const warnings: string[] = [];
  const [rules, ctx] = await Promise.all([activeRules(tx), loadContext(tx)]);
  for (const o of offerings) {
    if (!o.sectionId) continue;
    const classes = await tx.schedule.findMany({
      where: { semesterId: o.semesterId, subjectId: o.subjectId, sectionId: o.sectionId, status: { not: "ARCHIVED" }, facultyId: { not: o.facultyId } },
      select: { ...ENTRY, room: { select: { roomType: true, capacity: true } }, subject: { select: { code: true } }, section: { select: { name: true } }, semester: { select: { startDate: true, endDate: true } } },
    });
    if (!classes.length) continue;
    const term = classes[0].semester;
    const concurrent = { status: { not: "ARCHIVED" as const }, semester: { startDate: { lte: term.endDate }, endDate: { gte: term.startDate } } };
    for (const c of classes) {
      const rooms = c.room ? await tx.room.findMany({ where: { archivedAt: null, status: "AVAILABLE", roomType: c.room.roomType, capacity: { gte: c.room.capacity } }, select: { id: true } }) : [];
      const roomIds = c.roomId ? [c.roomId, ...rooms.map((r) => r.id).filter((id) => id !== c.roomId)] : [""];
      // Everything this class could collide with: the new teacher, the section, and the candidate rooms.
      const others = (await tx.schedule.findMany({
        where: { ...concurrent, id: { not: c.id }, OR: [{ facultyId: o.facultyId }, { sectionId: o.sectionId }, ...(c.roomId ? [{ roomId: { in: roomIds } }] : [])] },
        select: ENTRY,
      })).map(toEntry);
      const length = c.endMin - c.startMin;
      const fits = (s: SchedEntry) => checkEntry(s, others, rules, ctx).length === 0;
      // The current time first, then the nearest: same day, then following days, closest to the original start.
      const times = [{ dayOfWeek: c.dayOfWeek, startMin: c.startMin }, ...DAYS.map((_, i) => DAYS[(DAYS.indexOf(c.dayOfWeek) + i) % DAYS.length]).flatMap((dayOfWeek) =>
        Array.from({ length: Math.max(0, Math.floor((CLOSE - OPEN - length) / STEP) + 1) }, (_, k) => OPEN + k * STEP)
          .sort((a, b) => Math.abs(a - c.startMin) - Math.abs(b - c.startMin))
          .map((startMin) => ({ dayOfWeek, startMin })))];
      let target: SchedEntry | null = null;
      for (const t of times) {
        for (const roomId of roomIds) {
          const candidate = { ...toEntry(c), ...t, endMin: t.startMin + length, facultyId: o.facultyId, roomId };
          if (fits(candidate)) { target = candidate; break; }
        }
        if (target) break;
      }
      if (!target) {
        warnings.push(`${c.subject.code} ${c.section.name}: no time fits the assigned teacher's rules; the class stays with its current teacher.`);
        continue;
      }
      await tx.schedule.update({ where: { id: c.id }, data: { facultyId: o.facultyId, dayOfWeek: target.dayOfWeek, startMin: target.startMin, endMin: target.endMin, roomId: target.roomId || null } });
    }
  }
  return warnings;
}

/** Sends classes of sections that no longer have an assigned teacher back to Unscheduled; archived rows keep the history. */
export async function unscheduleUnassigned(tx: Tx, offerings: { subjectId: string; sectionId: string | null; semesterId: string }[]) {
  let count = 0;
  for (const o of offerings) {
    if (!o.sectionId) continue;
    const assigned = await tx.subjectAssignment.count({ where: { subjectId: o.subjectId, sectionId: o.sectionId, semesterId: o.semesterId, status: "ACTIVE" } });
    if (assigned) continue;
    count += (await tx.schedule.updateMany({ where: { subjectId: o.subjectId, sectionId: o.sectionId, semesterId: o.semesterId, status: { not: "ARCHIVED" } }, data: { status: "ARCHIVED" } })).count;
  }
  return count;
}
