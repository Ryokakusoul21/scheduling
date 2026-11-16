import { roomLabel } from "@/lib/rooms/label";
import { prisma } from "@/lib/db/prisma";
import { getScope } from "@/lib/permissions/scope";
import { isoDate } from "@/lib/occupancy/engine";
import { calendarRange, type CalendarView } from "@/lib/calendar";
import { levelLabel } from "@/lib/academics/levels";
import { listActivities, visibleActivities } from "@/lib/activities/activities";
import { departmentWhere } from "@/lib/permissions/department";
import { ACTIVITY_STATUS_LABELS } from "@/lib/activities/status";
import { PageHeader } from "@/components/ux/states";
import { ActivitiesReportButtons } from "@/components/ux/export-buttons";
import { activeTermLabel } from "@/lib/academics/term-label";
import { CalendarBoard, type CalendarEvent } from "./calendar-board";
import { ActivitiesTable } from "./activities-table";
import { ApprovalsBoard } from "./approvals-board";
import { CalendarTabs } from "./calendar-tabs";

export const metadata = { title: "Calendar of Activities · GRANBY COLLEGES OF SCIENCE AND TECHNOLOGY" };

const VIEWS: CalendarView[] = ["month", "week", "day"];
type Tab = "calendar" | "table" | "approvals";

/** "October 12, 2026" for printed titles. */
function longDate(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-PH", { dateStyle: "long", timeZone: "UTC" });
}

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ view?: string; date?: string; tab?: string }> }) {
  const scope = await getScope();
  const params = await searchParams;
  const tabs: Tab[] = scope.isAdmin ? ["calendar", "table", "approvals"] : ["calendar", "table"];
  const tab = tabs.includes(params.tab as Tab) ? (params.tab as Tab) : "calendar";
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });

  const [departments, rooms, term, pendingCount] = await Promise.all([
    prisma.department.findMany({ where: departmentWhere.department(scope), orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.room.findMany({ where: { archivedAt: null, ...departmentWhere.room(scope) }, orderBy: { roomNumber: "asc" }, select: { id: true, roomNumber: true, roomName: true } }),
    activeTermLabel(),
    scope.isAdmin ? prisma.activity.count({ where: { status: "PENDING" } }) : 0,
  ]);
  const formOptions = {
    departments: departments.map((d) => ({ value: d.id, label: d.name })),
    rooms: rooms.map((r) => ({ value: r.id, label: roomLabel(r) })),
    ownDepartmentId: scope.departmentId,
  };
  const canSubmit = scope.isAdmin || scope.role === "HEAD_OF_DEPARTMENT";

  const nav = <CalendarTabs active={tab} isAdmin={scope.isAdmin} showProposals={scope.isAdmin || scope.role === "HEAD_OF_DEPARTMENT"} pendingCount={pendingCount} />;

  if (tab !== "calendar") {
    const items =
      tab === "table"
        ? await listActivities(visibleActivities(scope))
        : await listActivities({ type: { not: "CLASS_SUSPENSION" }, departmentId: { not: null }, endDate: { gte: new Date(`${today}T00:00:00Z`) } }, { conflicts: true });
    return (
      <div className="space-y-4 pt-1">
        <PageHeader title="Calendar of Activities" description={tab === "approvals" ? "Review department submissions before they reach the school calendar." : "School events, holidays, and class suspensions."} />
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

  // Classes and examinations live in the Scheduler; the calendar shows bookings, events, holidays, and suspensions.
  const fromDate = new Date(`${from}T00:00:00Z`);
  const toDate = new Date(`${to}T00:00:00Z`);
  const [bookings, activities] = await Promise.all([
    prisma.roomBooking.findMany({
      // Bookings of other departments' rooms stay hidden.
      where: { status: "CONFIRMED", date: { gte: fromDate, lte: toDate }, room: departmentWhere.room(scope) },
      include: { room: { select: { roomNumber: true, roomName: true } }, bookedBy: { select: { name: true } } },
    }),
    // Rejected submissions never reach the calendar; pending ones show only to the Registrar and their department.
    listActivities({ AND: [visibleActivities(scope), { status: { not: "REJECTED" } }, { startDate: { lte: toDate } }, { endDate: { gte: fromDate } }] }),
  ]);

  const events: CalendarEvent[] = [];
  for (const b of bookings) {
    events.push({
      id: `booking-${b.id}`, type: "BOOKING", title: `${b.priority === "URGENT" || b.priority === "CRITICAL" ? "Urgent: " : ""}${roomLabel(b.room)}: ${b.purpose}`, date: isoDate(b.date), endDate: isoDate(b.date),
      startMin: b.startMin, endMin: b.endMin, detail: `Booked by ${b.bookedBy.name} · ${b.attendees} attendees`, href: "/bookings",
      info: { code: roomLabel(b.room), subject: b.purpose, room: roomLabel(b.room), faculty: b.bookedBy.name },
      resources: { roomId: b.roomId },
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
      info: { room: a.location || undefined, department: a.department, stage: a.level ? levelLabel(a.level) : "All levels" },
      href: a.type === "CLASS_SUSPENSION" || a.classChange ? "/suspensions" : undefined,
    });
  }
  const official = activities.filter((a) => a.status === "APPROVED");

  return (
    <div className="space-y-4 pt-1">
      <PageHeader
        title="Calendar of Activities"
        description="Room bookings, school events, holidays, and class suspensions in one place."
        actions={
          <ActivitiesReportButtons
            title={`School Activities: ${longDate(from)} to ${longDate(to)}`}
            term={term}
            filename={`school-activities-${from}`}
            rows={official.map((a) => ({ ...a, level: a.level ? levelLabel(a.level) : "", status: ACTIVITY_STATUS_LABELS[a.status] }))}
            official
            department="All Departments"
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
        canEditEvents={canSubmit}
        isAdmin={scope.isAdmin}
        ownDepartmentId={scope.departmentId}
        formOptions={formOptions}
      />
    </div>
  );
}
