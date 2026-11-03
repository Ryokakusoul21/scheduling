import "server-only";
import type { AcademicLevel, ExaminationType } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

const day = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Official window for one examination period and the dates examinations may never use, both read from the
 * approved Calendar of Activities only. `window` is null when no approved window exists (never guessed).
 */
export async function loadExamContext(type: ExaminationType, level: AcademicLevel | null, departmentIds: readonly string[] | null) {
  const owned = departmentIds ? { OR: [{ departmentId: null }, { departmentId: { in: [...departmentIds] } }] } : {};
  const [windows, activities] = await Promise.all([
    prisma.activity.findMany({
      where: { type: "EXAMINATION_WEEK", status: "APPROVED", examinationType: type, AND: [owned, { OR: [{ level: null }, ...(level ? [{ level }] : [])] }] },
      select: { startDate: true, endDate: true },
    }),
    prisma.activity.findMany({
      where: { status: "APPROVED", sectionIds: { isEmpty: true }, OR: [{ type: { in: ["HOLIDAY", "CLASS_SUSPENSION"] } }, { type: "SCHOOL_EVENT", startMin: null }] },
      select: { title: true, startDate: true, endDate: true },
    }),
  ]);
  const starts = windows.map((w) => day(w.startDate)).sort();
  const ends = windows.map((w) => day(w.endDate)).sort();
  const window = windows.length ? { start: starts[0], end: ends[ends.length - 1] } : null;

  const blockedDates = new Map<string, string>();
  for (const a of activities) {
    for (let t = a.startDate.getTime(); t <= a.endDate.getTime() && blockedDates.size < 800; t += 86_400_000) blockedDates.set(day(new Date(t)), a.title);
  }
  return { window, blockedDates };
}
