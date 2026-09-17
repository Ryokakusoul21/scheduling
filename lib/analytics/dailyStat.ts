import "server-only";
import { prisma } from "@/lib/db/prisma";

export interface CurrentCounts {
  totalStudents: number;
  totalFaculty: number;
  totalSubjects: number;
  totalRooms: number;
  openConflicts: number;
}

export type TrendMap = Partial<Record<keyof CurrentCounts, number | null>>;

function startOfToday() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/**
 * Records today's counts (idempotent - upserts today's row every call) and
 * returns the percentage change vs. the most recent prior day recorded.
 * Returns `null` per metric when there is no prior snapshot yet, so the UI
 * can show "New" instead of ever fabricating a trend number.
 */
export async function recordAndGetTrend(counts: CurrentCounts): Promise<TrendMap> {
  const today = startOfToday();

  const previous = await prisma.dailyStat.findFirst({
    where: { date: { lt: today } },
    orderBy: { date: "desc" },
  });

  await prisma.dailyStat.upsert({
    where: { date: today },
    update: counts,
    create: { date: today, ...counts },
  });

  if (!previous) {
    return {
      totalStudents: null,
      totalFaculty: null,
      totalSubjects: null,
      totalRooms: null,
      openConflicts: null,
    };
  }

  function pct(current: number, prior: number): number | null {
    if (prior === 0) return current === 0 ? 0 : null;
    return Math.round(((current - prior) / prior) * 1000) / 10;
  }

  return {
    totalStudents: pct(counts.totalStudents, previous.totalStudents),
    totalFaculty: pct(counts.totalFaculty, previous.totalFaculty),
    totalSubjects: pct(counts.totalSubjects, previous.totalSubjects),
    totalRooms: pct(counts.totalRooms, previous.totalRooms),
    openConflicts: pct(counts.openConflicts, previous.openConflicts),
  };
}
