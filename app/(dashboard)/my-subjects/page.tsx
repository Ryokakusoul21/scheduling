import { prisma } from "@/lib/db/prisma";
import { requireScope } from "@/lib/permissions/scope";
import { TEACHING_ROLES } from "@/lib/permissions/roles";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, PageHeader } from "@/components/ux/states";

export const metadata = { title: "My Assigned Subjects · GRANBY COLLEGES OF SCIENCE & TECHNOLOGY" };

/** Read-only list of the subjects the signed-in faculty member is assigned to teach. */
export default async function MySubjectsPage() {
  const scope = await requireScope(...TEACHING_ROLES);
  const rows = scope.facultyId ? await prisma.subjectAssignment.findMany({
    where: { facultyId: scope.facultyId, status: "ACTIVE" },
    orderBy: [{ semester: { startDate: "desc" } }, { subject: { code: "asc" } }],
    select: {
      id: true, createdAt: true, sectionId: true, subjectId: true, semesterId: true,
      subject: { select: { code: true, name: true, units: true, lectureHours: true, labHours: true } },
      section: { select: { name: true } },
      semester: { select: { name: true, isActive: true, academicYear: { select: { name: true } } } },
    },
  }) : [];
  // Marks an assignment as scheduled once at least one of its classes is on the timetable.
  const scheduled = rows.length ? await prisma.schedule.findMany({
    where: { facultyId: scope.facultyId!, status: { not: "ARCHIVED" }, semesterId: { in: [...new Set(rows.map((r) => r.semesterId))] } },
    select: { subjectId: true, sectionId: true, semesterId: true },
  }) : [];
  const isScheduled = (r: (typeof rows)[number]) => scheduled.some((s) => s.semesterId === r.semesterId && s.subjectId === r.subjectId && (!r.sectionId || s.sectionId === r.sectionId));
  const units = rows.filter((r) => r.semester.isActive).reduce((n, r) => n + r.subject.units, 0);

  return <div className="space-y-4">
    <PageHeader title="My Assigned Subjects" description={`Subjects your Head of Department assigned you to teach. Active terms: ${units} units. You are notified whenever an assignment changes.`} />
    {rows.length === 0 ? <EmptyState title="No assigned subjects yet" description="Your Head of Department has not assigned you any subjects." /> : <Card className="overflow-hidden"><div className="overflow-x-auto"><Table>
      <TableHeader><TableRow><TableHead>Term</TableHead><TableHead>Code</TableHead><TableHead>Subject</TableHead><TableHead>Section</TableHead><TableHead className="text-right">Units</TableHead><TableHead className="text-right">Hours</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
      <TableBody>{rows.map((r) => <TableRow key={r.id}>
        <TableCell className="whitespace-nowrap text-sm">{r.semester.name} {r.semester.academicYear.name}{r.semester.isActive && <Badge variant="secondary" className="ml-2">Active</Badge>}</TableCell>
        <TableCell className="font-medium">{r.subject.code}</TableCell>
        <TableCell>{r.subject.name}</TableCell>
        <TableCell>{r.section?.name ?? "All sections"}</TableCell>
        <TableCell className="text-right">{r.subject.units}</TableCell>
        <TableCell className="text-right">{r.subject.lectureHours + r.subject.labHours}</TableCell>
        <TableCell>{isScheduled(r) ? <Badge variant="outline">Scheduled</Badge> : <Badge variant="outline" className="border-warning/40 bg-warning/10 text-warning">Not yet scheduled</Badge>}</TableCell>
      </TableRow>)}</TableBody>
    </Table></div></Card>}
  </div>;
}
