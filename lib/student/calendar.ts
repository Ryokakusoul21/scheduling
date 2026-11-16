import type { PortalActivity } from "./portal";

/** Monday-first date cells, including neighboring dates to keep a six-week grid. */
export function calendarDays(month: string) {
  const first = new Date(`${month}-01T00:00:00Z`);
  const offset = (first.getUTCDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(first);
    date.setUTCDate(1 - offset + index);
    return date.toISOString().slice(0, 10);
  });
}

export function shiftMonth(month: string, amount: number) {
  const date = new Date(`${month}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + amount);
  return date.toISOString().slice(0, 7);
}

/** Inclusive date ranges keep holidays and other multi-day activities visible in each month they span. */
export function monthActivities(activities: PortalActivity[], month: string, type = "", search = "") {
  const start = `${month}-01`;
  const end = `${shiftMonth(month, 1)}-01`;
  const query = search.trim().toLowerCase();
  return activities.filter((activity) => activity.startDate < end && activity.endDate >= start
    && (!type || activity.type === type)
    && (!query || `${activity.title} ${activity.description}`.toLowerCase().includes(query)))
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || (a.startMin ?? 0) - (b.startMin ?? 0) || a.title.localeCompare(b.title));
}

export function monthLabel(month: string) {
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`));
}
