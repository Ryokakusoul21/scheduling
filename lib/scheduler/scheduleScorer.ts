import { SchedEntry, SchedFaculty, SchedRoom, ScoreBreakdown, SchedulingConstraints, DEFAULT_CONSTRAINTS } from "./types";

export interface ScoringContext {
  faculty: SchedFaculty[];
  rooms: SchedRoom[];
  constraints?: SchedulingConstraints;
}

function stdDev(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function facultyWorkloadBalance(entries: SchedEntry[], faculty: SchedFaculty[]): number {
  if (faculty.length === 0) return 100;
  const utilization = faculty.map((f) => {
    const minutes = entries
      .filter((e) => e.facultyId === f.id)
      .reduce((s, e) => s + (e.endMin - e.startMin), 0);
    return Math.min(minutes / 60 / Math.max(f.maxHours, 1), 1);
  });
  const spread = stdDev(utilization); // 0 (perfectly balanced) .. ~0.5 (very unbalanced)
  return Math.max(0, Math.round(100 - spread * 200));
}

function roomUtilization(entries: SchedEntry[], rooms: SchedRoom[]): number {
  if (rooms.length === 0) return 0;
  const AVAILABLE_MIN_PER_WEEK = 6 * 12 * 60; // 6 days x 12 hours, matches default constraints window
  const total = rooms.reduce((sum, r) => {
    const minutes = entries.filter((e) => e.roomId === r.id).reduce((s, e) => s + (e.endMin - e.startMin), 0);
    return sum + Math.min(minutes / AVAILABLE_MIN_PER_WEEK, 1);
  }, 0);
  return Math.round((total / rooms.length) * 100);
}

function studentScheduleQuality(entries: SchedEntry[]): number {
  const bySection = new Map<string, SchedEntry[]>();
  for (const e of entries) {
    const list = bySection.get(e.sectionId) ?? [];
    list.push(e);
    bySection.set(e.sectionId, list);
  }

  let totalGapPenalty = 0;
  let dayCount = 0;

  for (const list of bySection.values()) {
    const byDay = new Map<string, SchedEntry[]>();
    for (const e of list) {
      const d = byDay.get(e.dayOfWeek) ?? [];
      d.push(e);
      byDay.set(e.dayOfWeek, d);
    }
    for (const dayEntries of byDay.values()) {
      dayEntries.sort((a, b) => a.startMin - b.startMin);
      dayCount++;
      for (let i = 1; i < dayEntries.length; i++) {
        const gap = dayEntries[i].startMin - dayEntries[i - 1].endMin;
        if (gap > 60) totalGapPenalty += Math.min((gap - 60) / 60, 3); // cap penalty per gap
      }
    }
  }

  if (dayCount === 0) return 100;
  const avgPenalty = totalGapPenalty / dayCount;
  return Math.max(0, Math.round(100 - avgPenalty * 20));
}

function constraintSatisfaction(entries: SchedEntry[], constraints: SchedulingConstraints): number {
  if (entries.length === 0) return 100;
  let satisfied = 0;
  for (const e of entries) {
    let ok = true;
    if (constraints.avoidBefore !== undefined && e.startMin < constraints.avoidBefore) ok = false;
    if (constraints.avoidAfter !== undefined && e.endMin > constraints.avoidAfter) ok = false;
    if (ok) satisfied++;
  }
  return Math.round((satisfied / entries.length) * 100);
}

export function scoreSchedule(entries: SchedEntry[], ctx: ScoringContext): ScoreBreakdown {
  const constraints = ctx.constraints ?? DEFAULT_CONSTRAINTS;
  const workload = facultyWorkloadBalance(entries, ctx.faculty);
  const utilization = roomUtilization(entries, ctx.rooms);
  const quality = studentScheduleQuality(entries);
  const satisfaction = constraintSatisfaction(entries, constraints);

  const overall = Math.round(workload * 0.3 + utilization * 0.2 + quality * 0.25 + satisfaction * 0.25);

  return {
    facultyWorkloadBalance: workload,
    roomUtilization: utilization,
    studentScheduleQuality: quality,
    constraintSatisfaction: satisfaction,
    overallScore: overall,
  };
}
