import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { STAFF_ROLES } from "@/lib/permissions/roles";
import { ACADEMIC_LEVELS, LEVELS, isAcademicLevel, termLabel } from "@/lib/academics/levels";
import { Breadcrumbs } from "@/components/ux/breadcrumbs";
import { CardGrid } from "@/components/ux/card-grid";
import { PageHeader, SelectCard } from "@/components/ux/states";
import { Badge } from "@/components/ui/badge";
import { TermsManager } from "./terms-manager";
import { LEVEL_ACCENTS, LEVEL_ICONS } from "@/components/ux/level-icons";

export const metadata = { title: "Academic Year · GRANBY COLLEGES OF SCIENCE & TECHNOLOGY" };

export default async function AcademicYearDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ level?: string }>;
}) {
  await requireRole(...STAFF_ROLES);
  const { id } = await params;
  const { level: levelParam } = await searchParams;
  const level = isAcademicLevel(levelParam) ? levelParam : null;

  const year = await prisma.academicYear.findUnique({
    where: { id },
    include: {
      semesters: {
        include: { program: { select: { id: true, code: true } }, _count: { select: { schedules: true } } },
        orderBy: { startDate: "asc" },
      },
    },
  });
  if (!year) notFound();

  const programs = level === "COLLEGE"
    ? await prisma.program.findMany({ where: { level: "COLLEGE" }, orderBy: [{ sortOrder: "asc" }, { code: "asc" }], include: { department: { select: { code: true } } } })
    : [];

  const termsByLevel = (l: string) => year.semesters.filter((s) => s.level === l);

  return (
    <div className="space-y-5">
      <Breadcrumbs
        items={[
          { label: "Academic Years & Terms", href: "/academic-years" },
          { label: `A.Y. ${year.name}`, href: `/academic-years/${year.id}` },
          ...(level ? [{ label: LEVELS[level].label }] : []),
        ]}
      />
      <PageHeader
        title={`A.Y. ${year.name}`}
        description={
          level
            ? LEVELS[level].termKind === "semester"
              ? "Set the semesters for each course. Courses without their own semesters use the shared ones."
              : "Set the four grading quarters for this level."
            : "Choose a level to set up its terms."
        }
        actions={year.isActive ? <Badge>Active academic year</Badge> : undefined}
      />

      <CardGrid label="Academic levels" className="xl:grid-cols-4">
        {ACADEMIC_LEVELS.map((l) => {
          const terms = termsByLevel(l);
          const active = terms.filter((t) => t.isActive);
          return (
            <SelectCard
              key={l}
              href={`/academic-years/${year.id}?level=${l}`}
              selected={level === l}
              icon={LEVEL_ICONS[l]}
              accent={LEVEL_ACCENTS[l]}
              title={LEVELS[l].label}
              subtitle={LEVELS[l].termKind === "semester" ? "Semesters per course" : "1st to 4th quarter"}
              meta={
                <>
                  <Badge variant="secondary">{terms.length} terms</Badge>
                  {active.length > 0 ? (
                    <Badge variant="outline">Active: {[...new Set(active.map((t) => termLabel(t.type)))].join(", ")}</Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground">No active term</Badge>
                  )}
                </>
              }
            />
          );
        })}
      </CardGrid>

      {level && (
        <TermsManager
          year={{ id: year.id, name: year.name, startDate: year.startDate.toISOString().slice(0, 10), endDate: year.endDate.toISOString().slice(0, 10) }}
          level={level}
          programs={programs.map((p) => ({ id: p.id, code: p.code, name: p.name, department: p.department?.code ?? null }))}
          terms={termsByLevel(level).map((t) => ({
            id: t.id,
            type: t.type,
            programId: t.programId,
            startDate: t.startDate.toISOString().slice(0, 10),
            endDate: t.endDate.toISOString().slice(0, 10),
            isActive: t.isActive,
            classes: t._count.schedules,
          }))}
        />
      )}
    </div>
  );
}
