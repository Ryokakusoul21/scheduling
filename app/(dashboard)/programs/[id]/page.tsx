import Link from "next/link";
import { notFound } from "next/navigation";
import { BookOpen, CalendarBlank, UsersThree, CalendarDots } from "@phosphor-icons/react/ssr";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { STAFF_ROLES } from "@/lib/permissions/roles";
import { LEVELS, YEAR_LEVELS, gradeLabel, levelLabel, termLabel, yearLabel } from "@/lib/academics/levels";
import { Breadcrumbs } from "@/components/ux/breadcrumbs";
import { PageHeader } from "@/components/ux/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EditProgramButton } from "./edit-program-button";

export const metadata = { title: "Program · GCST Scheduling" };

export default async function ProgramDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole(...STAFF_ROLES);
  const { id } = await params;
  const [program, departments] = await Promise.all([
    prisma.program.findUnique({
      where: { id },
      include: {
        department: true,
        sections: { select: { yearLevel: true, gradeLevel: true, studentCount: true, _count: { select: { schedules: true } } } },
        subjects: { select: { yearLevel: true, gradeLevel: true, units: true } },
        semesters: { include: { academicYear: true }, orderBy: { startDate: "desc" } },
      },
    }),
    prisma.department.findMany({ orderBy: { code: "asc" } }),
  ]);
  if (!program || (program.level !== "COLLEGE" && program.level !== "SENIOR_HIGH")) notFound();

  const isCollege = program.level === "COLLEGE";
  const stages = isCollege
    ? YEAR_LEVELS.slice(0, 4).map((y) => ({ key: y, label: yearLabel(y), param: `year=${y}` }))
    : LEVELS.SENIOR_HIGH.grades.map((g) => ({ key: g, label: gradeLabel(g), param: `grade=${g}` }));
  const stageOf = (r: { yearLevel: string | null; gradeLevel: string | null }) => (isCollege ? r.yearLevel : r.gradeLevel);

  const learners = program.sections.reduce((sum, s) => sum + s.studentCount, 0);
  const classes = program.sections.reduce((sum, s) => sum + s._count.schedules, 0);
  const base = `level=${program.level}&program=${program.id}`;

  const stats = [
    { label: "Sections", value: program.sections.length, icon: UsersThree },
    { label: "Subjects", value: program.subjects.length, icon: BookOpen },
    { label: "Learners", value: learners, icon: UsersThree },
    { label: "Scheduled classes", value: classes, icon: CalendarDots },
  ];

  return (
    <div className="space-y-5">
      <Breadcrumbs items={[{ label: "Programs & Strands", href: "/programs" }, { label: program.code }]} />
      <PageHeader
        title={`${program.code} — ${program.name}`}
        description={`${levelLabel(program.level)}${program.department ? ` · ${program.department.name}` : ""}`}
        actions={
          <>
            <Button variant="outline" nativeButton={false} render={<Link href={`/scheduler?level=${program.level}&programId=${program.id}`} />}>
              <CalendarDots className="size-4" /> Open in Scheduler
            </Button>
            <EditProgramButton
              program={{ id: program.id, code: program.code, name: program.name, level: program.level, departmentId: program.departmentId ?? "" }}
              departments={departments.map((d) => ({ value: d.id, label: `${d.code} — ${d.name}` }))}
            />
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="flex items-center gap-3 p-4">
              <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <s.icon className="size-5" />
              </span>
              <div>
                <p className="text-2xl font-semibold">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">By {isCollege ? "year level" : "grade level"}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{isCollege ? "Year" : "Grade"}</TableHead>
                <TableHead>Sections</TableHead>
                <TableHead>Subjects</TableHead>
                <TableHead>Units</TableHead>
                <TableHead className="text-right">Manage</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stages.map((st) => {
                const sec = program.sections.filter((s) => stageOf(s) === st.key);
                const sub = program.subjects.filter((s) => stageOf(s) === st.key);
                return (
                  <TableRow key={st.key}>
                    <TableCell className="font-medium">{st.label}</TableCell>
                    <TableCell>{sec.length}</TableCell>
                    <TableCell>{sub.length}</TableCell>
                    <TableCell>{sub.reduce((sum, s) => sum + s.units, 0)}</TableCell>
                    <TableCell className="space-x-1 text-right">
                      <Button size="sm" variant="ghost" nativeButton={false} render={<Link href={`/sections?${base}&${st.param}`} />}>
                        Sections
                      </Button>
                      <Button size="sm" variant="ghost" nativeButton={false} render={<Link href={`/subjects?${base}&${st.param}`} />}>
                        Subjects
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {isCollege && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarBlank className="size-4" /> Course semesters
            </CardTitle>
          </CardHeader>
          <CardContent>
            {program.semesters.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                This course uses the shared College semesters. Add course-specific ones from{" "}
                <Link href="/academic-years" className="font-medium text-primary hover:underline">
                  Academic Years & Terms
                </Link>
                .
              </p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {program.semesters.map((t) => (
                  <li key={t.id}>
                    <Link href={`/academic-years/${t.academicYearId}?level=COLLEGE`}>
                      <Badge variant={t.isActive ? "default" : "secondary"}>
                        A.Y. {t.academicYear.name} · {termLabel(t.type)}
                      </Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
