import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

/**
 * A fingerprint of everything that feeds the dashboards (timetable, adjustments, bookings, workload fixes,
 * settings). Pages poll it and refresh only when it changes. It reveals no records, only timestamps and counts.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const [schedules, batches, undone, bookings, fixes, fixesUndone, proposals, activities, exams, settings, sections, faculty, rooms] = await Promise.all([
    prisma.schedule.aggregate({ _max: { updatedAt: true }, _count: true }),
    prisma.adjustmentBatch.aggregate({ _max: { createdAt: true }, _count: true }),
    prisma.adjustmentBatch.count({ where: { undoneAt: { not: null } } }),
    prisma.roomBooking.aggregate({ _max: { updatedAt: true }, _count: true }),
    prisma.workloadFix.aggregate({ _max: { appliedAt: true }, _count: true }),
    prisma.workloadFix.count({ where: { undoneAt: { not: null } } }),
    prisma.workloadProposal.aggregate({ _max: { createdAt: true, reviewedAt: true }, _count: true }),
    prisma.activity.aggregate({ _max: { updatedAt: true }, _count: true }),
    prisma.examination.aggregate({ _max: { updatedAt: true }, _count: true }),
    prisma.systemSetting.aggregate({ _max: { updatedAt: true } }),
    prisma.section.aggregate({ _max: { updatedAt: true }, _count: true }),
    prisma.faculty.aggregate({ _max: { updatedAt: true }, _count: true }),
    prisma.room.aggregate({ _max: { updatedAt: true }, _count: true }),
  ]);

  const t = (d: Date | null | undefined) => d?.getTime() ?? 0;
  const version = [
    t(schedules._max.updatedAt), schedules._count, t(batches._max.createdAt), batches._count, undone,
    t(bookings._max.updatedAt), bookings._count, t(fixes._max.appliedAt), fixes._count, fixesUndone,
    t(proposals._max.createdAt), t(proposals._max.reviewedAt), proposals._count, t(activities._max.updatedAt), activities._count,
    t(exams._max.updatedAt), exams._count, t(settings._max.updatedAt), t(sections._max.updatedAt), sections._count,
    t(faculty._max.updatedAt), faculty._count, t(rooms._max.updatedAt), rooms._count,
  ].join(".");
  return NextResponse.json({ version }, { headers: { "cache-control": "no-store" } });
}
