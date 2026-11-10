export function isPeriodOpenNow(period: { status: string; startsAt: Date; endsAt: Date }, now = new Date()) {
  return period.status === "OPEN" && period.startsAt <= now && period.endsAt >= now;
}
