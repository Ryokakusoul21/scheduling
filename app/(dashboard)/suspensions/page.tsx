import { prisma } from "@/lib/db/prisma";
import { DEFAULT_LEVEL, LevelTabs } from "@/components/academics/level-tabs";
import { PageHeader } from "@/components/ux/states";
import { ACADEMIC_LEVELS, type AcademicLevel } from "@/lib/academics/levels";
import { isoDate } from "@/lib/occupancy/engine";
import { scopeQuery } from "@/lib/permissions/policy";
import { SCHEDULING_ROLES } from "@/lib/permissions/roles";
import { policyUserFromScope, requireScope } from "@/lib/permissions/scope";
import { SuspensionWorkspace, type OrderView } from "./suspension-workspace";
import { deliveryMode } from "@/lib/suspensions/continuity";
import { formatRange } from "@/lib/scheduler/timetable";

export const metadata = { title: "Class Suspensions · GRANBY COLLEGES OF SCIENCE AND TECHNOLOGY" };

export default async function SuspensionsPage({ searchParams }: { searchParams: Promise<{ level?: string }> }) {
  const scope = await requireScope(...SCHEDULING_ROLES);
  const { level: raw } = await searchParams;
  const handledLevels = scope.role === "HEAD_OF_DEPARTMENT"
    ? (await prisma.section.findMany({ where: { AND: [scopeQuery(policyUserFromScope(scope), "section"), { archivedAt: null }] }, select: { level: true }, distinct: ["level"] })).map((section) => section.level)
    : [...ACADEMIC_LEVELS];
  const availableLevels = ACADEMIC_LEVELS.filter((candidate) => handledLevels.includes(candidate));
  const level = availableLevels.includes(raw as AcademicLevel) ? raw as AcademicLevel : availableLevels[0] ?? DEFAULT_LEVEL;
  const mine = scopeQuery(policyUserFromScope(scope), "classSuspension");

  const [programs, orders, sections, classes] = await Promise.all([
    // Courses (College) or strands (Senior High School) the caller may suspend, with how many sections each has.
    prisma.program.findMany({
      where: { AND: [scopeQuery(policyUserFromScope(scope), "program"), { level }] },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, _count: { select: { sections: { where: { archivedAt: null } } } } },
    }),
    // One level at a time; explicit all-levels orders show under every tab.
    prisma.classSuspension.findMany({
      where: { AND: [{ OR: [mine, { departmentId: null }] }, { OR: [{ level }, { level: null }] }] },
      include: { issuedBy: { select: { name: true } }, liftedBy: { select: { name: true } }, batch: { select: { adjustments: { select: { kind: true, scheduleId: true } }, activity: { select: { location: true } } } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.section.findMany({ where: { AND: [scopeQuery(policyUserFromScope(scope), "section"), { level, archivedAt: null }] }, select: { id: true, name: true, programId: true, program: { select: { name: true } } }, orderBy: { name: "asc" } }),
    prisma.schedule.findMany({
      where: { AND: [scopeQuery(policyUserFromScope(scope), "schedule"), { status: "PUBLISHED", section: { level, archivedAt: null } }] },
      select: { id: true, dayOfWeek: true, startMin: true, endMin: true, subject: { select: { code: true, name: true } }, section: { select: { id: true, name: true } }, faculty: { select: { fullName: true } }, semester: { select: { name: true } } },
      orderBy: [{ subject: { code: "asc" } }, { startMin: "asc" }],
    }),
  ]);
  const visibleSectionIds = new Set(sections.map((section) => section.id));

  const views: OrderView[] = orders.filter((order) => scope.role === "REGISTRAR" || order.sectionIds.some((id) => visibleSectionIds.has(id))).map((o) => ({
    id: o.id,
    title: o.title,
    reason: o.reason,
    start: isoDate(o.startDate),
    end: isoDate(o.endDate),
    startMin: o.startMin,
    endMin: o.endMin,
    sections: scope.role === "REGISTRAR" ? o.sectionIds.length : o.sectionIds.filter((id) => visibleSectionIds.has(id)).length,
    mode: deliveryMode(o.batch?.adjustments ?? []),
    meetings: new Set(o.batch?.adjustments.filter((item) => item.kind !== "MAKE_UP").map((item) => item.scheduleId)).size,
    meetingLink: deliveryMode(o.batch?.adjustments ?? []) === "VIRTUAL" ? o.batch?.activity?.location ?? null : null,
    allLevels: o.level === null,
    issuedBy: `${o.issuedBy.name}, ${o.issuedRole === "REGISTRAR" ? "Registrar" : "Head of Department"}`,
    status: o.status,
    liftedBy: o.liftedBy?.name ?? null,
    // A Head of Department can lift only orders of their own department; the server checks again.
    canLift: o.status === "ACTIVE" && (scope.role === "REGISTRAR" || (o.sectionIds.length > 0 && o.sectionIds.every((id) => visibleSectionIds.has(id)))),
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Class Suspensions & Virtual Classes"
        description={scope.role === "REGISTRAR" ? "Manage class continuity across the school. Preview the affected meetings before suspending classes or moving them online." : "Manage the classes in your assigned department and programs. Suspend selected meetings or continue them virtually at their original time."}
      />
      {scope.role === "REGISTRAR" && <LevelTabs basePath="/suspensions" active={level} params={{}} />}
      <SuspensionWorkspace key={level} level={level}
        availableLevels={scope.role === "HEAD_OF_DEPARTMENT" ? availableLevels : []}
        today={new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" })}
        programs={programs.map((p) => ({ value: p.id, label: p.name, detail: `${sections.filter((section) => section.programId === p.id).length} sections`, sections: sections.filter((section) => section.programId === p.id).length })).filter((p) => p.sections > 0)}
        sections={sections.map((section) => ({ value: section.id, label: section.name, detail: section.program?.name ?? "Section without a program" }))}
        classes={classes.map((meeting) => ({ value: meeting.id, label: `${meeting.subject.code} · ${meeting.section.name}`, detail: `${meeting.subject.name} · ${meeting.faculty.fullName} · ${meeting.dayOfWeek[0]}${meeting.dayOfWeek.slice(1).toLowerCase()} ${formatRange(meeting.startMin, meeting.endMin)} · ${meeting.semester.name}` }))}
        canSuspendLevel={scope.role === "REGISTRAR"} orders={views} />
    </div>
  );
}
