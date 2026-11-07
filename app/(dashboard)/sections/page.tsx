import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { requireScope } from "@/lib/permissions/scope";
import { departmentWhere } from "@/lib/permissions/department";
import { STAFF_ROLES } from "@/lib/permissions/roles";
import { flowHref, isComplete, parseFlow } from "@/lib/academics/flow";
import { LEVELS, gradeLabel, levelLabel, termLabel, yearLabel } from "@/lib/academics/levels";
import { LevelFlow } from "@/components/academics/level-flow";
import { PageHeader } from "@/components/ux/states";
import { cn } from "@/lib/utils";
import { SectionsGrid } from "./sections-grid";
import { SectionTermFilters } from "./term-filters";
import { parseSectionFilters, semesterType } from "@/lib/sections/filters";
import { canManageSection } from "@/lib/sections/permissions";

export const metadata = { title: "Sections · GRANBY COLLEGES OF SCIENCE AND TECHNOLOGY" };

export default async function SectionsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const [scope, params, academicYears, activeTerm] = await Promise.all([
    requireScope(...STAFF_ROLES),
    searchParams,
    prisma.academicYear.findMany({ orderBy: { startDate: "desc" }, select: { id: true, name: true, isActive: true } }),
    prisma.semester.findFirst({ where: { isActive: true, level: "COLLEGE" }, include: { academicYear: true }, orderBy: { startDate: "desc" } }),
  ]);
  const defaults = { year: activeTerm?.academicYear.name ?? academicYears[0]?.name ?? "", semester: activeTerm?.type === "SECOND" ? "2" : activeTerm?.type === "SUMMER" ? "MIDYEAR" : "1" };
  const filters = parseSectionFilters(params, { ...defaults, years: academicYears.map((row) => row.name) });
  const termType = semesterType(filters.semester);
  const legacyYearLevel = ["FIRST", "SECOND", "THIRD", "FOURTH", "FIFTH", "SIXTH"].includes(params.year ?? "") ? params.year : undefined;
  const flow = parseFlow({ ...params, year: params.yearLevel ?? legacyYearLevel });

  if (scope.role === "HEAD_OF_DEPARTMENT" && params.other !== "1") {
    const programs = await prisma.program.findMany({ where: { departmentId: scope.departmentId, level: "COLLEGE" }, orderBy: [{ sortOrder: "asc" }, { code: "asc" }], select: { id: true, code: true, name: true, departmentId: true } });
    const program = programs.find((row) => row.id === filters.program) ?? programs[0];
    const years = ["FIRST", "SECOND", "THIRD", "FOURTH"] as const;
    const selectedYear = years.includes(filters.yearLevel as never) ? filters.yearLevel! : "FIRST";
    // Everything below needs only the program, so it loads together; the section list then needs the term.
    const [term, curriculum, largestRoom] = await Promise.all([program ? prisma.semester.findFirst({ where: { level: "COLLEGE", type: termType, academicYear: { name: filters.year }, OR: [{ programId: program.id }, { programId: null }] }, include: { academicYear: true }, orderBy: { programId: "desc" } }) : null,
      program ? prisma.subject.findMany({ where: { archivedAt: null, yearLevel: selectedYear as never, OR: [{ programId: program.id }, { sharedPrograms: { some: { id: program.id } } }], AND: [{ OR: [{ semester: termType }, { semester: null }] }] }, select: { lectureHours: true, labHours: true } }) : [],
      prisma.room.aggregate({ where: { archivedAt: null, status: "AVAILABLE", OR: [{ departmentId: scope.departmentId }, { departmentId: null }] }, _max: { capacity: true } }),
    ]);
    const sections = program && term ? await prisma.section.findMany({ where: { programId: program.id, yearLevel: selectedYear as never, semesterId: term.id, archivedAt: filters.status === "ACTIVE" ? null : { not: null } }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], include: { program: { select: { code: true, name: true } }, semester: { include: { academicYear: true } }, schedules: { where: { status: { not: "ARCHIVED" } }, select: { subjectId: true, component: true, room: { select: { capacity: true } } } }, classPlaceholders: { select: { subjectId: true, component: true } } } }) : [];
    const q = (patch: Record<string, string>) => { const next = new URLSearchParams({ year: filters.year, semester: filters.semester, status: filters.status, program: program?.id ?? "", yearLevel: selectedYear, ...patch }); return `/sections?${next}`; };
    return <div className="space-y-4"><PageHeader title="Sections" description="Manage your department's sections for one academic term at a time." actions={<Link href={q({ other: "1" })} className="inline-flex h-8 items-center rounded-md border px-3 text-sm font-medium hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">View other departments (read-only)</Link>} /><SectionTermFilters years={academicYears.map((row) => row.name)} selectedYear={filters.year} selectedSemester={filters.semester} status={filters.status} />
      <nav className="flex flex-wrap gap-2" aria-label="Program and year level">{programs.map((row) => <Link key={row.id} href={q({ program: row.id })} title={row.name} aria-current={row.id === program?.id ? "page" : undefined} className={cn("rounded-full border px-3 py-1.5 text-sm font-medium focus-visible:ring-2 focus-visible:ring-ring", row.id === program?.id && "border-primary bg-primary text-primary-foreground")}>{row.code}</Link>)}<span className="mx-1 border-l" />{years.map((year) => <Link key={year} href={q({ yearLevel: year })} aria-current={year === selectedYear ? "page" : undefined} className={cn("rounded px-2.5 py-1.5 text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring", year === selectedYear && "bg-muted font-semibold")}>{yearLabel(year)}</Link>)}</nav>
      {program && term ? <SectionsGrid heading={`${program.code} · ${yearLabel(selectedYear)}`} context={{ level: "COLLEGE", programId: program.id, yearLevel: selectedYear, gradeLevel: "", semesterId: term.id }} strands={[]} terms={[{ value: term.id, label: `Academic Year ${term.academicYear.name} · ${termLabel(term.type)}` }]} canManage currentTerm={{ id: term.id, label: `${term.academicYear.name} · ${termLabel(term.type)}` }} generation={{ program: { id: program.id, code: program.code, name: program.name }, yearNumber: years.indexOf(selectedYear as never) + 1, curriculumClasses: curriculum.reduce((count, subject) => count + Number(subject.lectureHours > 0) + Number(subject.labHours > 0), 0), largestRoomCapacity: largestRoom._max.capacity ?? 0 }} sections={sections.map((section) => { const scheduled = new Set(section.schedules.map((row) => `${row.subjectId}:${row.component}`)).size; const total = Math.max(section.classPlaceholders.length, scheduled); const assignedCapacity = Math.max(0, ...section.schedules.map((row) => row.room.capacity)); return { id: section.id, name: section.name, studentCount: section.studentCount, level: section.level, programId: section.programId ?? "", program: section.program?.code ?? null, programName: section.program?.name ?? null, yearLevel: section.yearLevel ?? "", gradeLevel: section.gradeLevel ?? "", semesterId: section.semesterId ?? "", term: `${section.semester?.academicYear.name} · ${termLabel(section.semester!.type)}`, classes: total, scheduled, assignedCapacity, editable: canManageSection({ role: scope.role, departmentId: scope.departmentId }, section) }; })} /> : <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">No academic term is configured for this program and semester.</div>}
    </div>;
  }

  const [all, programs] = await Promise.all([
    prisma.section.findMany({ where: { archivedAt: filters.status === "ACTIVE" ? null : { not: null }, semester: { academicYear: { name: filters.year }, type: termType }, ...(params.other === "1" ? {} : departmentWhere.section(scope)) }, select: { level: true, programId: true, yearLevel: true, gradeLevel: true } }),
    prisma.program.findMany({ where: params.other === "1" ? {} : departmentWhere.program(scope), orderBy: [{ sortOrder: "asc" }, { code: "asc" }], select: { id: true, code: true, name: true, level: true } }),
  ]);

  let list: React.ReactNode = null;
  if (isComplete(flow) && flow.level) {
    const where =
      flow.level === "COLLEGE"
        ? { level: flow.level, programId: flow.programId, yearLevel: flow.year as never }
        : { level: flow.level, gradeLevel: flow.grade, ...(flow.strand ? { programId: flow.strand } : {}) };
    const [sections, terms] = await Promise.all([
      prisma.section.findMany({
        where: { ...where, archivedAt: filters.status === "ACTIVE" ? null : { not: null }, semester: { academicYear: { name: filters.year }, type: termType }, ...(params.other === "1" ? {} : departmentWhere.section(scope)) },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        include: {
          program: { select: { code: true, name: true } },
          semester: { select: { type: true, academicYear: { select: { name: true } } } },
          _count: { select: { schedules: true } },
        },
      }),
      flow.level === "COLLEGE"
        ? prisma.semester.findMany({
            where: { level: "COLLEGE", OR: [{ programId: null }, { programId: flow.programId }] },
            include: { academicYear: true, program: { select: { code: true } } },
            orderBy: { startDate: "desc" },
          })
        : Promise.resolve([]),
    ]);
    const strands = programs.filter((p) => p.level === "SENIOR_HIGH");
    const program = programs.find((p) => p.id === flow.programId);
    const heading =
      flow.level === "COLLEGE" ? `${program?.code ?? ""} · ${yearLabel(flow.year!)}` : `${levelLabel(flow.level)} · ${gradeLabel(flow.grade!)}`;

    list = (
      <div className="space-y-3">
        {flow.level === "SENIOR_HIGH" && (
          <nav aria-label="Filter by strand" className="flex flex-wrap gap-1.5">
            {[{ id: null as string | null, code: "All strands" }, ...strands].map((s) => (
              <Link
                key={s.code}
                href={flowHref("/sections", { ...flow, strand: s.id })}
                aria-current={flow.strand === s.id ? "page" : undefined}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors hover:bg-accent",
                  flow.strand === s.id && "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
                )}
              >
                {s.code}
              </Link>
            ))}
          </nav>
        )}
        <SectionsGrid
          heading={heading}
          canManage={scope.isAdmin || params.other !== "1"}
          context={{
            level: flow.level,
            programId: flow.level === "COLLEGE" ? (flow.programId ?? "") : (flow.strand ?? ""),
            yearLevel: flow.level === "COLLEGE" ? (flow.year ?? "") : "",
            gradeLevel: flow.grade ?? "",
          }}
          strands={LEVELS[flow.level].usesPrograms && flow.level === "SENIOR_HIGH" ? strands.map((s) => ({ value: s.id, label: `${s.code} — ${s.name}` })) : []}
          terms={terms.map((t) => ({ value: t.id, label: `Academic Year ${t.academicYear.name} · ${termLabel(t.type)}${t.program ? ` (${t.program.code})` : ""}` }))}
          sections={sections.map((s) => ({
            id: s.id,
            name: s.name,
            studentCount: s.studentCount,
            level: s.level,
            programId: s.programId ?? "",
            program: s.program?.code ?? null,
            programName: s.program?.name ?? null,
            yearLevel: s.yearLevel ?? "",
            gradeLevel: s.gradeLevel ?? "",
            semesterId: s.semesterId ?? "",
            term: s.semester ? `${s.semester.academicYear.name} · ${termLabel(s.semester.type)}` : null,
            classes: s._count.schedules,
          }))}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Sections" description="Pick a level and year or grade to create and manage its class sections." />
      <SectionTermFilters years={academicYears.map((row) => row.name)} selectedYear={filters.year} selectedSemester={filters.semester} status={filters.status} />
      <LevelFlow basePath="/sections" rootLabel="Sections" noun="sections" flow={flow} rows={all} programs={programs} />
      {list}
    </div>
  );
}
