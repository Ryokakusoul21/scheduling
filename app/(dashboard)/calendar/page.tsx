import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { getScope } from "@/lib/permissions/scope";
import { loadPlan } from "@/lib/occupancy/load";
import { isoDate } from "@/lib/occupancy/engine";
import { calendarRange, type CalendarView } from "@/lib/calendar";
import { formatRange } from "@/lib/scheduler/timetable";
import { levelLabel } from "@/lib/academics/levels";
import { listActivities, visibleActivities } from "@/lib/activities/activities";
import { ACTIVITY_STATUS_LABELS } from "@/lib/activities/status";
import { PageHeader } from "@/components/ux/states";
import { ActivitiesReportButtons } from "@/components/ux/export-buttons";
import { activeTermLabel } from "@/lib/academics/term-label";
import { cn } from "@/lib/utils";
import { CalendarBoard, type CalendarEvent } from "./calendar-board";
import { ActivitiesTable } from "./activities-table";
import { ApprovalsBoard } from "./approvals-board";

export const metadata = { title: "Calendar of Activities · GRANBY COLLEGES OF SCIENCE & TECHNOLOGY" };

const VIEWS: CalendarView[] = ["month", "week", "day"];
type Tab = "calendar" | "table" | "approvals";

/** "October 12, 2026" for printed titles. */
function longDate(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-PH", { dateStyle: "long", timeZone: "UTC" });
}

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ view?: string; date?: string; scope?: string; tab?: string }> }) {
  const scope = await getScope();
  const params = await searchParams;
  const tabs: Tab[] = scope.isAdmin ? ["calendar", "table", "approvals"] : ["calendar", "table"];
  const tab = tabs.includes(params.tab as Tab) ? (params.tab as Tab) : "calendar";
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });

  const [departments, rooms, term, pendingCount] = await Promise.all([
    prisma.department.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.room.findMany({ where: { archivedAt: null }, orderBy: { roomName: "asc" }, select: { id: true, roomName: true } }),
    activeTermLabel(),
    scope.isAdmin ? prisma.activity.count({ where: { status: "PENDING" } }) : 0,
  ]);
  const formOptions = {
    departments: departments.map((d) => ({ value: d.id, label: d.name })),
    rooms: rooms.map((r) => ({ value: r.id, label: r.roomName })),
    ownDepartmentId: scope.departmentId,
  };
  const canSubmit = scope.isAdmin || scope.role === "HEAD_OF_DEPARTMENT";

  const nav = (
    <nav aria-label="Calendar of Activities sections" className="flex gap-1 border-b">
      {tabs.map((t) => (
        <Link
          key={t}
          href={`/calendar?tab=${t}`}
          aria-current={tab === t ? "page" : undefined}
          className={cn("-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium", tab === t ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}
        >
          {t === "calendar" ? "Calendar" : t === "table" ? "Table" : "Activity Approvals"}
          {t === "approvals" && pendingCount > 0 && <span className="rounded-full bg-amber-500 px-1.5 text-[11px] font-semibold text-white">{pendingCount}</span>}
        </Link>
      ))}
    </nav>
  );

  if (tab !== "calendar") {
    const items =
      tab === "table"
        ? await listActivities(visibleActivities(scope))
        : await listActivities({ type: { not: "CLASS_SUSPENSION" }, departmentId: { not: null }, endDate: { gte: new Date(`${today}T00:00:00Z`) } }, { conflicts: true });
    return (
      <div className="space-y-4">
        <PageHeader title="Calendar of Activities" description="School events, holidays, and class suspensions, with approval of department submissions." />
        {nav}
        {tab === "table" ? (
          <ActivitiesTable items={items} today={today} term={term} departments={formOptions.departments} formOptions={formOptions} canEdit={canSubmit} isAdmin={scope.isAdmin} ownDepartmentId={scope.departmentId} />
        ) : (
          <ApprovalsBoard items={items} departments={formOptions.departments} />
        )}
      </div>
    );
  }

  const view = VIEWS.includes(params.view as CalendarView) ? (params.view as CalendarView) : "week";
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
    // Rejected submissions never reach the calendar; pending ones show only to the Administrator and their department.
    listActivities({ AND: [visibleActivities(scope), { status: { not: "REJECTED" } }, { startDate: { lte: toDate } }, { endDate: { gte: fromDate } }] }),
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
    const pending = a.status !== "APPROVED";
    events.push({
      id: `activity-${a.id}`, type: a.type as CalendarEvent["type"], title: pending ? `Pending: ${a.title}` : a.title, date: a.startDate, endDate: a.endDate,
      startMin: a.startMin, endMin: a.endMin,
      detail: [a.description, a.location && `Location: ${a.location}`, `${a.department} · ${a.level ? levelLabel(a.level) : "All levels"}`, a.participants && `Participants: ${a.participants}`, a.reviewNote && `Review note: ${a.reviewNote}`].filter(Boolean).join("\n"),
      badge: pending ? ACTIVITY_STATUS_LABELS[a.status] : undefined,
      pending,
      activity: a,
      href: a.type === "CLASS_SUSPENSION" ? "/adjustments" : undefined,
    });
  }
  const official = activities.filter((a) => a.status === "APPROVED");

  return (
    <div className="space-y-4">
      <PageHeader
        title="Calendar of Activities"
        description="Classes, examinations, room bookings, school events, holidays, and class suspensions in one place."
        actions={
          <ActivitiesReportButtons
            title={`School Activities: ${longDate(from)} to ${longDate(to)}`}
            term={term}
            filename={`school-activities-${from}`}
            rows={official.map((a) => ({ ...a, level: a.level ? levelLabel(a.level) : "", status: ACTIVITY_STATUS_LABELS[a.status] }))}
          />
        }
      />
      {nav}
      <CalendarBoard
        view={view}
        date={date}
        today={today}
        from={from}
        to={to}
        events={events}
        classScope={classScope}
        scopeOptions={options}
        canEditEvents={canSubmit}
        isAdmin={scope.isAdmin}
        ownDepartmentId={scope.departmentId}
        formOptions={formOptions}
      />
    </div>
  );
}
