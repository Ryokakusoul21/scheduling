import { prisma } from "@/lib/db/prisma";
import Link from "next/link";
import { requireScope } from "@/lib/permissions/scope";
import { isoDate } from "@/lib/occupancy/engine";
import { formatRange } from "@/lib/scheduler/timetable";
import { PageHeader } from "@/components/ux/states";
import { ProposalWorkspace } from "./proposal-workspace";
import type { ProposalListItem } from "@/lib/activities/proposals";

export const metadata = { title: "School Activity Proposals · GRANBY COLLEGES OF SCIENCE & TECHNOLOGY" };

export default async function ActivityProposalsPage({ searchParams }: { searchParams: Promise<{ proposal?: string }> }) {
  const scope = await requireScope("HEAD_OF_DEPARTMENT", "ADMINISTRATOR");
  const params = await searchParams;
  const [terms, proposals, departments] = await Promise.all([
    prisma.semester.findMany({ include: { academicYear: true }, orderBy: [{ academicYear: { startDate: "desc" } }, { startDate: "asc" }] }),
    prisma.activityProposal.findMany({
      where: scope.isAdmin ? {} : { createdById: scope.userId },
      include: { semester: { include: { academicYear: true } }, department: true, rows: { orderBy: { sortOrder: "asc" } } },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.department.findMany({ where: scope.isAdmin ? {} : { id: scope.departmentId ?? "" }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const creators = new Map((await prisma.user.findMany({ where: { id: { in: proposals.map((p) => p.createdById) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const items: ProposalListItem[] = proposals.map((p) => ({
    id: p.id, semesterId: p.semesterId, semester: p.semester.name, schoolYear: p.semester.academicYear.name,
    department: p.department.name, departmentId: p.departmentId, level: p.level, version: p.version, status: p.status,
    reviewNote: p.reviewNote ?? "", createdBy: creators.get(p.createdById) ?? "Program Head", preparedBy: p.preparedBy ?? creators.get(p.createdById) ?? "Program Head", designation: p.designation ?? "Program Head", updatedAt: p.updatedAt.toISOString(),
    rows: p.rows.map((r) => ({ id: r.id, date: formatDate(isoDate(r.startDate), isoDate(r.endDate)), activity: r.title,
      time: r.startMin === null || r.endMin === null ? "" : formatRange(r.startMin, r.endMin), location: r.location ?? "",
      level: r.level ?? "", category: r.category ?? "", status: r.status, reviewNote: r.reviewNote ?? "", activityId: r.activityId })),
  }));
  return <div className="space-y-4"><PageHeader title="School Activity Proposals" description="Prepare, validate, submit, review, and publish a whole semester's activity table." />
    <nav aria-label="Calendar of Activities sections" className="flex gap-1 overflow-x-auto border-b">
      <Link href="/calendar?tab=calendar" className="-mb-px border-b-2 border-transparent px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground">Calendar</Link>
      <Link href="/calendar?tab=table" className="-mb-px border-b-2 border-transparent px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground">Table</Link>
      {scope.isAdmin && <Link href="/calendar?tab=approvals" className="-mb-px border-b-2 border-transparent px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground">Activity Approvals</Link>}
      <Link href="/calendar/proposals" aria-current="page" className="-mb-px border-b-2 border-primary px-3 py-2 text-sm font-medium text-foreground">Semester Proposals</Link>
    </nav>
    <ProposalWorkspace isAdmin={scope.isAdmin} ownDepartmentId={scope.departmentId} selectedId={params.proposal} proposals={items}
      terms={terms.map((t) => ({ id: t.id, label: `${t.academicYear.name} · ${t.name}`, level: t.level }))}
      departments={departments.map((d) => ({ id: d.id, name: d.name }))} />
  </div>;
}

function formatDate(start: string, end: string) {
  const long = (v: string) => new Date(`${v}T00:00:00Z`).toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
  return start === end ? long(start) : `${long(start)} to ${long(end)}`;
}
