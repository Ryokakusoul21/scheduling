import { prisma } from "@/lib/db/prisma";
import { getScope } from "@/lib/permissions/scope";
import { loadPlan } from "@/lib/occupancy/load";
import { isoDate } from "@/lib/occupancy/engine";
import { calendarRange, type CalendarView } from "@/lib/calendar";
import { formatRange } from "@/lib/scheduler/timetable";
import { PageHeader } from "@/components/ux/states";
import { CalendarBoard, type CalendarEvent } from "./calendar-board";

export const metadata = { title: "Calendar of Activities · GRANBY COLLEGES OF SCIENCE & TECHNOLOGY" };

const VIEWS: CalendarView[] = ["month", "week", "day"];

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ view?: string; date?: string; scope?: string }> }) {
  const scope = await getScope();
  const params = await searchParams;
  const view = VIEWS.includes(params.view as CalendarView) ? (params.view as CalendarView) : "week";
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.date ?? "") ? params.date! : today;
  const { from, to } = calendarRange(view, date);

  // Which classes to show: own, own department, or everything (Administrator).
  const options = scope.isAdmin ? ["all", "mine"] : scope.role === "HEAD_OF_DEPARTMENT" ? ["department", "mine"] : ["mine"];
  const classScope = options.includes(params.scope ?? "") ? params.scope! : options[0];

  const fromDate = new Date(`${from}T00:00:00Z`);
  const toDate = new Date(`${to}T00:00:00Z`);
  const [plan, exams, bookings, activities] = await Promise.all([
    loadPlan(from, to),
    prisma.examination.findMany({
      where: { date: { gte: fromDate, lte: toDate } },
      include: { subject: { select: { code: true, name: true } }, section: { select: { name: true, program: { select: { departmentId: true } } } }, room: { select: { roomName: true } }, proctor: { select: { fullName: true } } },
    }),
    prisma.roomBooking.findMany({
      where: { status: "CONFIRMED", date: { gte: fromDate, lte: toDate } },
      include: { room: { select: { roomName: true } }, bookedBy: { select: { name: true } } },
    }),
    prisma.activity.findMany({ where: { startDate: { lte: toDate }, endDate: { gte: fromDate } }, orderBy: { startDate: "asc" } }),
  ]);

  const mine = (facultyIds: string[]) => !!scope.facultyId && facultyIds.includes(scope.facultyId);
  const inScope = (facultyIds: string[], departmentId: string | null) =>
    classScope === "all" || mine(facultyIds) || (classScope === "department" && departmentId === scope.departmentId);

  const events: CalendarEvent[] = [];
  for (const s of plan.sessions) {
    const info = plan.classInfo.get(s.scheduleId);
    if (!inScope([s.facultyId], info?.departmentId ?? null)) continue;
    const moved = s.status !== "REGULAR";
    events.push({
      id: `class-${s.scheduleId}-${s.date}`,
      type: "CLASS",
      title: `${info?.subjectCode} ${info?.sectionName}`,
      date: s.date,
      endDate: s.date,
      startMin: s.startMin,
      endMin: s.endMin,
      detail: [
        info?.subjectName,
        `${plan.roomName.get(s.roomId)} · ${plan.facultyName.get(s.facultyId)}`,
        s.component === "LABORATORY" ? "Laboratory" : "Lecture",
        moved && s.original ? `${s.status === "MAKE_UP" ? "Make-up for" : "Moved from"} ${s.original.date}, ${formatRange(s.original.startMin, s.original.endMin)}` : null,
        s.reason,
      ].filter(Boolean).join("\n"),
      badge: s.status === "MOVED" ? "Moved" : s.status === "MAKE_UP" ? "Make-up" : undefined,
    });
  }
  for (const e of exams) {
    if (!inScope([e.proctorId], e.section.program?.departmentId ?? null)) continue;
    events.push({
      id: `exam-${e.id}`, type: "EXAMINATION", title: `Examination: ${e.subject.code} ${e.section.name}`, date: isoDate(e.date), endDate: isoDate(e.date),
      startMin: e.startMin, endMin: e.endMin, detail: `${e.subject.name}\n${e.room.roomName} · Proctor: ${e.proctor.fullName}`, href: "/examinations",
    });
  }
  for (const b of bookings) {
    events.push({
      id: `booking-${b.id}`, type: "BOOKING", title: `${b.room.roomName}: ${b.purpose}`, date: isoDate(b.date), endDate: isoDate(b.date),
      startMin: b.startMin, endMin: b.endMin, detail: `Booked by ${b.bookedBy.name} · ${b.attendees} attendees`, href: "/bookings",
    });
  }
  for (const a of activities) {
    events.push({
      id: `activity-${a.id}`, type: a.type, title: a.title, date: isoDate(a.startDate), endDate: isoDate(a.endDate),
      startMin: a.startMin, endMin: a.endMin, detail: a.description ?? "",
      activity: { id: a.id, type: a.type, title: a.title, description: a.description ?? "", startDate: isoDate(a.startDate), endDate: isoDate(a.endDate), startMin: a.startMin, endMin: a.endMin },
      href: a.type === "CLASS_SUSPENSION" ? "/adjustments" : undefined,
    });
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Calendar of Activities" description="Classes, examinations, room bookings, school events, holidays, and class suspensions in one place." />
      <CalendarBoard
        view={view}
        date={date}
        today={today}
        from={from}
        to={to}
        events={events}
        classScope={classScope}
        scopeOptions={options}
        canEditEvents={scope.role !== "FACULTY"}
        canEditHolidays={scope.isAdmin}
      />
    </div>
  );
}
