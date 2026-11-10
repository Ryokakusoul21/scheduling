import "server-only";
import type { SchedulingPeriodKind } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { isPeriodOpenNow } from "./period-rules";

export { isPeriodOpenNow } from "./period-rules";

export async function submissionPeriodError(semesterId: string, kind: SchedulingPeriodKind, now = new Date()) {
  const period = await prisma.schedulingPeriod.findUnique({
    where: { semesterId_kind: { semesterId, kind } },
    select: { name: true, startsAt: true, endsAt: true, status: true },
  });
  if (period && isPeriodOpenNow(period, now)) return null;
  const name = kind === "CLASS_TIMETABLE" ? "class timetable" : "examination";
  return period
    ? `The ${name} submission period is closed. Contact the Registrar.`
    : `The Registrar has not opened a ${name} submission period for this term.`;
}
