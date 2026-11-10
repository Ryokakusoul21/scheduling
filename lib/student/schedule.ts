import { activitiesOn, manilaNow, NO_CLASS_TYPES } from "./format";
import type { PortalActivity, PortalClass, PortalMove } from "./portal";

export const DAY_ENUMS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"];

/** True when a holiday or suspension on that date covers the class time. */
export function isCancelled(c: Pick<PortalClass, "startMin" | "endMin">, dayActivities: PortalActivity[]) {
  return dayActivities.some((a) => NO_CLASS_TYPES.has(a.type) && (a.startMin == null || (a.startMin < c.endMin && c.startMin < (a.endMin ?? 1440))));
}

/** Adds days to a YYYY-MM-DD date and returns the new date and its weekday enum. */
export function shiftDate(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return { date: d.toISOString().slice(0, 10), day: DAY_ENUMS[(d.getUTCDay() + 6) % 7] };
}

/** Today's classes with live, done, and cancelled status, plus the next class within the coming week. */
export function nowAndNext(classes: PortalClass[], activities: PortalActivity[], at: Date, moves: PortalMove[] = []) {
  const now = manilaNow(at);
  const todayActivities = activitiesOn(activities, now.date);
  const matches = (move: PortalMove, cls: PortalClass) => move.scheduleId
    ? move.scheduleId === cls.id
    : move.subjectCode === cls.subjectCode && move.fromStartMin === cls.startMin && move.fromEndMin === cls.endMin;
  const onDate = (date: string, day: string) => {
    const regular = classes.filter((cls) => cls.dayOfWeek === day && !moves.some((move) => move.date === date && matches(move, cls)));
    const adjusted = moves.filter((move) => (move.kind === "ONLINE" ? move.date : move.newDate ?? move.date) === date).flatMap((move) => {
      const cls = classes.find((row) => matches(move, row));
      return cls ? [{ ...cls, dayOfWeek: day, startMin: move.startMin, endMin: move.endMin, room: move.kind === "ONLINE" ? "Online or asynchronous" : move.room, building: move.kind !== "ONLINE" && move.room === cls.room ? cls.building : null }] : [];
    });
    return [...regular, ...adjusted];
  };
  const today = onDate(now.date, now.day)
    .sort((a, b) => a.startMin - b.startMin)
    .map((c) => ({
      ...c,
      cancelled: isCancelled(c, todayActivities),
      live: c.startMin <= now.minutes && now.minutes < c.endMin,
      done: c.endMin <= now.minutes,
    }));

  let next: { cls: PortalClass; date: string; inMinutes: number | null } | null = null;
  for (let offset = 0; offset <= 7 && !next; offset++) {
    const { date, day } = shiftDate(now.date, offset);
    const dayActivities = activitiesOn(activities, date);
    const found = onDate(date, day)
      .filter((c) => (offset > 0 || c.startMin > now.minutes) && !isCancelled(c, dayActivities))
      .sort((a, b) => a.startMin - b.startMin)[0];
    if (found) next = { cls: found, date, inMinutes: offset === 0 ? found.startMin - now.minutes : null };
  }

  const dayOff = todayActivities.find((a) => NO_CLASS_TYPES.has(a.type) && a.startMin == null) ?? null;
  return { now, today, next, dayOff, todayActivities };
}
