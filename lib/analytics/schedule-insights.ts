export const SCHEDULE_STATES = ["PUBLISHED", "REVIEW", "DRAFT"] as const;
export type ScheduleState = (typeof SCHEDULE_STATES)[number];
export const SCHEDULE_STATE_LABELS: Record<ScheduleState, string> = { PUBLISHED: "Published", REVIEW: "Awaiting review", DRAFT: "Draft" };
export const WEEK_DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"] as const;

export interface InsightMeeting {
  id: string;
  roomId: string | null;
  facultyId: string;
  sectionId: string;
  dayOfWeek: string;
  startMin: number;
  endMin: number;
  status: string;
  termStart: string;
  termEnd: string;
  affects?: { date: string }[];
}

const round = (value: number) => Math.round(value * 10) / 10;

/** Recurring meetings conflict only if their terms share an actual occurrence of the meeting weekday. */
function shareOccurrence(a: InsightMeeting, b: InsightMeeting) {
  const start = a.termStart > b.termStart ? a.termStart : b.termStart;
  const end = a.termEnd < b.termEnd ? a.termEnd : b.termEnd;
  if (start > end) return false;
  const date = new Date(`${start}T00:00:00Z`);
  const weekday = WEEK_DAYS.indexOf(a.dayOfWeek as (typeof WEEK_DAYS)[number]);
  if (weekday < 0 || !Number.isFinite(date.getTime())) return false;
  const offset = (weekday - (date.getUTCDay() + 6) % 7 + 7) % 7;
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10) <= end;
}

/** Summary and collision counts derive from exactly the rows currently in view. A pair is counted once even when it shares several resources. */
export function scheduleInsights(input: readonly InsightMeeting[]) {
  const rows = input.filter((row) => SCHEDULE_STATES.includes(row.status as ScheduleState));
  const statuses = SCHEDULE_STATES.map((status) => ({ status, label: SCHEDULE_STATE_LABELS[status], count: rows.filter((row) => row.status === status).length }));
  const daily = WEEK_DAYS.map((day) => {
    const meetings = rows.filter((row) => row.dayOfWeek === day);
    return { day, label: day[0] + day.slice(1).toLowerCase(), count: meetings.length, hours: round(meetings.reduce((sum, row) => sum + Math.max(0, row.endMin - row.startMin) / 60, 0)) };
  });
  const conflictIds = new Set<string>();
  let conflictPairs = 0;
  const resourceConflicts = { room: 0, faculty: 0, section: 0 };
  // Partition by weekday and stop once later meetings cannot overlap this one.
  for (const day of WEEK_DAYS) {
    const meetings = rows.filter((row) => row.dayOfWeek === day && row.endMin > row.startMin).sort((a, b) => a.startMin - b.startMin);
    for (let i = 0; i < meetings.length; i++) {
      const a = meetings[i];
      for (let j = i + 1; j < meetings.length && meetings[j].startMin < a.endMin; j++) {
        const b = meetings[j];
        const room = !!a.roomId && a.roomId === b.roomId;
        const faculty = !!a.facultyId && a.facultyId === b.facultyId;
        const section = !!a.sectionId && a.sectionId === b.sectionId;
        if ((!room && !faculty && !section) || !shareOccurrence(a, b)) continue;
        conflictPairs++;
        if (room) resourceConflicts.room++;
        if (faculty) resourceConflicts.faculty++;
        if (section) resourceConflicts.section++;
        conflictIds.add(a.id); conflictIds.add(b.id);
      }
    }
  }
  const published = statuses.find((row) => row.status === "PUBLISHED")!.count;
  return {
    total: rows.length,
    weeklyHours: round(rows.reduce((sum, row) => sum + Math.max(0, row.endMin - row.startMin) / 60, 0)),
    published, publicationRate: rows.length ? round(published / rows.length * 100) : 0,
    sections: new Set(rows.map((row) => row.sectionId).filter(Boolean)).size,
    faculty: new Set(rows.map((row) => row.facultyId).filter(Boolean)).size,
    rooms: new Set(rows.map((row) => row.roomId).filter(Boolean)).size,
    affectedMeetings: rows.filter((row) => row.affects?.length).length,
    affectedOccurrences: rows.reduce((sum, row) => sum + new Set(row.affects?.map((affect) => affect.date)).size, 0),
    conflictPairs, conflictIds: [...conflictIds], resourceConflicts, statuses, daily,
  };
}

export type ScheduleInsights = ReturnType<typeof scheduleInsights>;

/** Availability windows sometimes overlap; count each room-minute only once per weekday. */
export function weeklyAvailableHours(windows: readonly { dayOfWeek: string; startMin: number; endMin: number }[], fallback = 72) {
  if (!windows.length) return fallback;
  let minutes = 0;
  for (const day of WEEK_DAYS) {
    const intervals = windows.filter((window) => window.dayOfWeek === day && window.endMin > window.startMin).sort((a, b) => a.startMin - b.startMin);
    let end = -Infinity;
    for (const interval of intervals) {
      minutes += Math.max(0, interval.endMin - Math.max(end, interval.startMin));
      end = Math.max(end, interval.endMin);
    }
  }
  return round(minutes / 60);
}
