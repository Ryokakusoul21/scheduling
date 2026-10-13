import Link from "next/link";
import { Gauge, Exam, DoorOpen, UserMinus, ArrowRight } from "@phosphor-icons/react/ssr";
import { prisma } from "@/lib/db/prisma";
import { getWorkloadSettings } from "@/lib/settings";
import { statusOf } from "@/lib/workload/optimizer";
import { formatRange } from "@/lib/scheduler/timetable";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const STATUS_TEXT = { OVERLOADED: "Overloaded", UNDERLOADED: "Underloaded", BALANCED: "Within limits" };

/** Personal teaching summary for Faculty and Heads of Department: load, proctoring, bookings, and reports. */
export async function MyTeaching({ facultyId, userId, activeTermIds }: { facultyId: string | null; userId: string; activeTermIds: string[] }) {
  const today = new Date(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" }) + "T00:00:00Z");
  const soon = new Date(today);
  soon.setUTCDate(soon.getUTCDate() + 14);

  const [limits, faculty, classes, exams, bookings, reports] = await Promise.all([
    getWorkloadSettings(),
    facultyId ? prisma.faculty.findUnique({ where: { id: facultyId }, select: { maxHours: true } }) : null,
    facultyId
      ? prisma.schedule.findMany({ where: { facultyId, semesterId: { in: activeTermIds }, status: { not: "ARCHIVED" } }, select: { startMin: true, endMin: true, sectionId: true, subjectId: true, subject: { select: { units: true } } } })
      : [],
    facultyId
      ? prisma.examination.findMany({ where: { proctorId: facultyId, date: { gte: today, lte: soon } }, include: { subject: { select: { code: true } }, section: { select: { name: true } }, room: { select: { roomName: true } } }, orderBy: { date: "asc" }, take: 3 })
      : [],
    prisma.roomBooking.findMany({ where: { bookedById: userId, status: "CONFIRMED", date: { gte: today } }, include: { room: { select: { roomName: true } } }, orderBy: { date: "asc" }, take: 3 }),
    facultyId ? prisma.unavailability.count({ where: { facultyId, status: "PENDING" } }) : 0,
  ]);

  const hours = Math.round((classes.reduce((s, c) => s + c.endMin - c.startMin, 0) / 60) * 10) / 10;
  const units = [...new Map(classes.map((c) => [`${c.sectionId}|${c.subjectId}`, c.subject.units])).values()].reduce((s, u) => s + u, 0);
  const load = limits.measure === "HOURS" ? hours : units;
  const maximum = limits.measure === "HOURS" ? Math.min(limits.maximum, faculty?.maxHours ?? limits.maximum) : limits.maximum;
  const status = statusOf(load, limits.minimum, maximum);
  const unit = limits.measure === "HOURS" ? "hours" : "units";
  const day = (d: Date) => d.toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Gauge className="size-4 text-primary" /> My teaching</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm">
        {facultyId ? (
          <Link href="/workload" className="block rounded-lg border p-3 hover:bg-accent">
            <p className="flex items-baseline justify-between">
              <span className="text-2xl font-semibold tabular-nums">{load}</span>
              <span className={cn("text-xs font-medium", status === "OVERLOADED" ? "text-red-600" : status === "UNDERLOADED" ? "text-amber-600" : "text-emerald-600")}>{STATUS_TEXT[status]}</span>
            </p>
            <p className="text-xs text-muted-foreground">{unit} this term · allowed {limits.minimum} to {maximum}</p>
          </Link>
        ) : (
          <p className="text-muted-foreground">Your account is not linked to a faculty record yet. Ask the Administrator to link it.</p>
        )}

        <div className="space-y-1.5">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><Exam className="size-3.5" /> Proctoring in the next two weeks</p>
          {exams.length === 0 ? <p className="text-xs text-muted-foreground">None</p> : exams.map((e) => (
            <p key={e.id} className="text-xs">{day(e.date)}, {formatRange(e.startMin, e.endMin)}: {e.subject.code} {e.section.name} in {e.room.roomName}</p>
          ))}
        </div>
        <div className="space-y-1.5">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><DoorOpen className="size-3.5" /> My upcoming room bookings</p>
          {bookings.length === 0 ? <p className="text-xs text-muted-foreground">None</p> : bookings.map((b) => (
            <p key={b.id} className="text-xs">{day(b.date)}, {formatRange(b.startMin, b.endMin)}: {b.room.roomName}</p>
          ))}
        </div>
        {reports > 0 && (
          <Link href="/availability" className="flex items-center gap-2 text-xs font-medium text-primary hover:underline">
            <UserMinus className="size-3.5" /> {reports} unavailability report(s) waiting for review <ArrowRight className="size-3" />
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
