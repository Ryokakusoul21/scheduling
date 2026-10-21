/** Which holidays, class suspensions, and approved activities fall on a weekly class (browser-safe, unit-tested). */
import { dayOfWeek, eachDate } from "@/lib/occupancy/engine";

export interface ReportClass {
  sectionId: string;
  departmentId: string | null;
  level: string;
  dayOfWeek: string;
  startMin: number;
  endMin: number;
  /** Term window, ISO dates. */
  termStart: string;
  termEnd: string;
}

export interface ReportActivity {
  id: string;
  type: string;
  title: string;
  startDate: string;
  endDate: string;
  startMin: number | null;
  endMin: number | null;
  departmentId: string | null;
  level: string | null;
  /** Suspensions only; empty means every section. */
  sectionIds: string[];
}

export interface Affect {
  date: string;
  type: string;
  title: string;
}

/** True when the activity concerns the class: holidays always, suspensions by section, events by department, level, and time. */
export function activityApplies(a: ReportActivity, c: ReportClass) {
  if (a.type === "HOLIDAY") return true;
  if (a.type === "CLASS_SUSPENSION") return a.sectionIds.length === 0 || a.sectionIds.includes(c.sectionId);
  if (a.departmentId && a.departmentId !== c.departmentId) return false;
  if (a.level && a.level !== c.level) return false;
  return a.startMin === null || a.endMin === null || (a.startMin < c.endMin && c.startMin < a.endMin);
}

/** Every date in the class's term when it meets and an applicable activity takes place. */
export function affectsOf(c: ReportClass, activities: ReportActivity[]): Affect[] {
  const out: Affect[] = [];
  for (const a of activities) {
    const from = a.startDate > c.termStart ? a.startDate : c.termStart;
    const to = a.endDate < c.termEnd ? a.endDate : c.termEnd;
    if (from > to || !activityApplies(a, c)) continue;
    for (const date of eachDate(from, to)) if (dayOfWeek(date) === c.dayOfWeek) out.push({ date, type: a.type, title: a.title });
  }
  return out.sort((x, y) => x.date.localeCompare(y.date));
}
