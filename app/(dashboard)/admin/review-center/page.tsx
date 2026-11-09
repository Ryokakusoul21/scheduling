import { prisma } from "@/lib/db/prisma";
import { requireScope } from "@/lib/permissions/scope";
import { PUBLISH_ROLES } from "@/lib/permissions/roles";
import { PageHeader } from "@/components/ux/states";
import { levelLabel } from "@/lib/academics/levels";
import { LOCKED_STATUSES, SUBMISSION_LABEL, submissionTitle } from "@/lib/scheduler/submissions";
import { ReviewInbox, type ReviewRow } from "./review-inbox";

export const metadata = { title: "Registrar Review Center · GRANBY COLLEGES OF SCIENCE AND TECHNOLOGY" };

const QUEUES = [
  ["room-bookings", "Room Booking Requests"], ["adjustments", "Schedule Adjustments"], ["schedule-requests", "Schedule Requests"],
  ["activity-proposals", "Activity Proposals"], ["examinations", "Examination Schedules"], ["workload", "Workload Fixes"],
  ["change-requests", "Change Requests"], ["class-schedules", "Class Schedules"],
] as const;
const fmt = (date: Date) => date.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
const words = (value: string) => value.toLowerCase().replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());

export default async function ReviewCenterPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const scope = await requireScope("SUPER_ADMINISTRATOR", "REGISTRAR");
  // The Registrar sees schedule submissions but only the Super Administrator decides on them.
  const scheduleKind = <K extends string>(kind: K) => (PUBLISH_ROLES.includes(scope.role) ? kind : "READ_ONLY");
  const query = await searchParams;
  const active = QUEUES.some(([key]) => key === query.queue) ? query.queue! : "class-schedules";
  const submissionInclude = { department: true, semester: { include: { academicYear: true } }, submittedBy: { select: { name: true } } } as const;
  const [departments, submissions, bookings, adjustments, requests, activities, workload] = await Promise.all([
    prisma.department.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.timetableSubmission.findMany({ where: { status: { in: LOCKED_STATUSES } }, include: submissionInclude, orderBy: { submittedAt: "desc" }, take: 300 }),
    prisma.roomBooking.findMany({ where: { status: "CONFIRMED" }, include: { room: true, bookedBy: true }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.unavailability.findMany({ where: { status: "PENDING" }, include: { faculty: { include: { department: true } }, room: true }, orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.scheduleRequest.findMany({ where: { status: "PENDING" }, include: { requestedBy: { include: { faculty: { include: { department: true } } } }, schedule: { include: { subject: true, section: { include: { department: true } } } } }, orderBy: { createdAt: "desc" }, take: 300 }),
    prisma.activityProposal.findMany({ where: { status: "PENDING_APPROVAL" }, include: { department: true, semester: { include: { academicYear: true } }, rows: true }, orderBy: { submittedAt: "desc" }, take: 200 }),
    prisma.workloadProposal.findMany({ where: { kind: "WORKLOAD", status: "PENDING" }, orderBy: { createdAt: "desc" }, take: 200 }),
  ]);
  // One row per whole timetable; the title opens the Timetable Review page.
  const submissionRow = (item: (typeof submissions)[number]): ReviewRow => ({
    id: item.id, kind: scheduleKind(item.kind === "EXAMINATION" ? "EXAMINATION" : "CLASS_SCHEDULE"), title: submissionTitle(item),
    detail: `${words(item.semester.type)} ${item.semester.academicYear.name} · ${item.classCount} ${item.kind === "EXAMINATION" ? "examinations" : "classes"}${item.publishAt ? ` · Publishes ${fmt(item.publishAt)}` : ""}${item.overrideReason ? ` · Workload override: ${item.overrideReason}` : ""}`,
    department: item.department.name, level: levelLabel(item.semester.level), requester: item.submittedBy.name ?? "Head of Department", date: fmt(item.submittedAt), status: SUBMISSION_LABEL[item.status], href: `/admin/review-center/timetables/${item.id}`,
  });
  const departmentNames = new Map(departments.map((department) => [department.id, department.name]));
  const rowsByQueue: Record<string, ReviewRow[]> = {
    "class-schedules": submissions.filter((x) => x.kind === "CLASS").map(submissionRow),
    "room-bookings": bookings.map((item) => ({ id: item.id, kind: "READ_ONLY", title: item.purpose, detail: `${item.room.roomName}, ${item.attendees} attendees`, department: "Institution-wide", level: "All school levels", requester: item.bookedBy.name, date: fmt(item.date), status: "Approved", href: "/bookings" })),
    adjustments: adjustments.map((item) => ({ id: item.id, kind: "READ_ONLY", title: item.kind === "FACULTY" ? `${item.faculty?.fullName ?? "Faculty member"} unavailable` : `${item.room?.roomName ?? "Room"} unavailable`, detail: item.reason, department: item.faculty?.department?.name ?? "Institution-wide", level: "All school levels", requester: "Faculty or Head of Department", date: `${fmt(item.startDate)}${item.endDate > item.startDate ? ` – ${fmt(item.endDate)}` : ""}`, status: "Pending review", href: "/adjustments" })),
    "schedule-requests": requests.filter((item) => item.type !== "FACULTY_CHANGE").map((item) => ({ id: item.id, kind: "SCHEDULE_REQUEST", title: words(item.type), detail: item.reason ?? item.schedule?.subject.name ?? "Scheduling request", department: item.requestedBy.faculty?.department?.name ?? item.schedule?.section.department?.name ?? "Institution-wide", level: item.schedule ? "Class schedule" : "All school levels", requester: item.requestedBy.name, date: fmt(item.createdAt), status: "Pending review", href: "/requests" })),
    "change-requests": requests.filter((item) => item.type === "FACULTY_CHANGE").map((item) => ({ id: item.id, kind: "SCHEDULE_REQUEST", title: "Faculty Record Change", detail: item.reason ?? "Faculty record update", department: item.requestedBy.faculty?.department?.name ?? "Institution-wide", level: "Faculty records", requester: item.requestedBy.name, date: fmt(item.createdAt), status: "Pending review", href: "/requests" })),
    "activity-proposals": activities.map((item) => ({ id: item.id, kind: "ACTIVITY_PROPOSAL", title: `${item.department.name} activities, version ${item.version}`, detail: `${item.rows.length} proposed activities · ${item.semester.academicYear.name}`, department: item.department.name, level: levelLabel(item.level), requester: "Head of Department", date: fmt(item.submittedAt ?? item.updatedAt), status: "Pending approval", href: `/calendar/proposals?proposal=${item.id}` })),
    examinations: submissions.filter((x) => x.kind === "EXAMINATION").map(submissionRow),
    workload: workload.map((item) => ({ id: item.id, kind: "WORKLOAD_FIX", title: item.automatic ? "Automatic workload fix" : "Workload reassignment", detail: item.explanation, department: item.departmentId ? departmentNames.get(item.departmentId) ?? "Department" : "Institution-wide", level: "Faculty workload", requester: item.automatic ? "Automatic workload checker" : "Head of Department", date: fmt(item.createdAt), status: "Pending review", href: "/workload" })),
  };
  const tabs = QUEUES.map(([key, label]) => ({ key, label, count: rowsByQueue[key]?.length ?? 0 }));
  let rows = rowsByQueue[active] ?? [];
  if (query.department) rows = rows.filter((row) => row.department === query.department);
  if (query.level) rows = rows.filter((row) => row.level === query.level);
  if (query.status) rows = rows.filter((row) => row.status === query.status);
  if (query.requester) rows = rows.filter((row) => row.requester.toLowerCase().includes(query.requester!.toLowerCase()));
  if (query.date) rows = rows.filter((row) => row.date.includes(query.date!));

  return <div className="space-y-4">
    <PageHeader title="Registrar Review Center" description="Review proposals and requests from every department. Approvals make schedules official; corrections, rejections, and requested changes require an audited reason." />
    <form className="grid gap-2 rounded-lg border bg-card p-3 sm:grid-cols-2 lg:grid-cols-6">
      <input type="hidden" name="queue" value={active} />
      <select name="department" defaultValue={query.department ?? ""} className="h-9 rounded-md border bg-background px-2 text-sm"><option value="">All departments</option>{departments.map((item) => <option key={item.id}>{item.name}</option>)}</select>
      <input name="level" defaultValue={query.level ?? ""} placeholder="School level" className="h-9 rounded-md border bg-background px-3 text-sm" />
      <input name="date" defaultValue={query.date ?? ""} placeholder="Date" className="h-9 rounded-md border bg-background px-3 text-sm" />
      <input name="status" defaultValue={query.status ?? ""} placeholder="Status" className="h-9 rounded-md border bg-background px-3 text-sm" />
      <input name="requester" defaultValue={query.requester ?? ""} placeholder="Requester" className="h-9 rounded-md border bg-background px-3 text-sm" />
      <button className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">Apply filters</button>
    </form>
    <ReviewInbox rows={rows} tabs={tabs} active={active} />
  </div>;
}