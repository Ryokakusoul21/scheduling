export interface TeachingSession {
  id: string;
  date: string;
  startMin: number;
  endMin: number;
  title: string;
  room: string;
  changed: boolean;
}

/** Compare real dated meetings, so a rescheduled class keeps its actual date. */
export function teachingDay(sessions: TeachingSession[], date: string, minutes: number) {
  const ordered = [...sessions].sort((a, b) => a.date.localeCompare(b.date) || a.startMin - b.startMin);
  const today = ordered.filter((session) => session.date === date);
  return {
    today,
    current: today.find((session) => session.startMin <= minutes && minutes < session.endMin) ?? null,
    next: ordered.find((session) => session.date > date || (session.date === date && session.startMin > minutes)) ?? null,
    remaining: today.filter((session) => session.endMin > minutes).length,
  };
}

type Component = { subjectId: string; component: string };

/** Multiple weekly meetings fulfill one subject component, not multiple curriculum slots. */
export function sectionReadiness(sections: { id: string; name: string; schedules: Component[]; classPlaceholders: Component[] }[]) {
  return sections.map((section) => {
    const key = (row: Component) => `${row.subjectId}:${row.component}`;
    const scheduled = new Set(section.schedules.map(key));
    const planned = new Set([...scheduled, ...section.classPlaceholders.map(key)]);
    return { id: section.id, name: section.name, scheduled: scheduled.size, planned: planned.size, missing: planned.size - scheduled.size };
  });
}

/** Keep the newest version of each independent timetable, including examination periods. */
export function latestTimetables<T extends { departmentId: string; semesterId: string; kind: string; examType: string | null; version: number }>(rows: T[]) {
  const latest = new Map<string, T>();
  for (const row of rows) {
    const key = `${row.departmentId}:${row.semesterId}:${row.kind}:${row.examType ?? ""}`;
    if (!latest.has(key) || latest.get(key)!.version < row.version) latest.set(key, row);
  }
  return [...latest.values()];
}
