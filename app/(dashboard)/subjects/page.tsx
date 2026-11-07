import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { requireScope } from "@/lib/permissions/scope";
import { departmentWhere } from "@/lib/permissions/department";
import { STAFF_ROLES } from "@/lib/permissions/roles";
import { ANY_YEAR, GENERAL, flowHref, isComplete, parseFlow } from "@/lib/academics/flow";
import { LEVELS, gradeLabel, yearLabel } from "@/lib/academics/levels";
import { LevelFlow } from "@/components/academics/level-flow";
import { PageHeader } from "@/components/ux/states";
import { cn } from "@/lib/utils";
import { SubjectsList } from "./subjects-list";
import { CurriculumList } from "./curriculum-list";
import { canManageSubject, canViewSubject } from "@/lib/subjects/permissions";
import { filterSubjects, parseSubjectFilters } from "@/lib/subjects/filters";
import { assignableFaculty } from "@/lib/subjects/assignments";
import { STATUS_FILTERS, type StatusFilter } from "@/lib/subjects/status";
import type { SubjectRequestDetails } from "@/lib/subjects/request-rules";
import type { SubjectRequestInfo } from "./types";

export const metadata = { title: "Subjects · GRANBY COLLEGES OF SCIENCE AND TECHNOLOGY" };

export default async function SubjectsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const scope = await requireScope(...STAFF_ROLES);
  const params = await searchParams;
  const flow = parseFlow(params);

  if (scope.role === "HEAD_OF_DEPARTMENT" && params.showOther !== "1") {
    const programSelect = { id: true, code: true, name: true, departmentId: true } as const;
    let programs = await prisma.program.findMany({ where: { departmentId: scope.departmentId, level: "COLLEGE" }, orderBy: [{ sortOrder: "asc" }, { code: "asc" }], select: programSelect });
    // A department without college programs (General Education) sees every curriculum and manages only the subjects it owns.
    if (!programs.length) programs = await prisma.program.findMany({ where: { level: "COLLEGE" }, orderBy: [{ sortOrder: "asc" }, { code: "asc" }], select: programSelect });
    const filters = parseSubjectFilters(params, true);
    const program = programs.find((p) => p.id === filters.program) ?? programs[0];
    const validYears = ["FIRST", "SECOND", "THIRD", "FOURTH"] as const;
    const year = validYears.includes(filters.year as never) ? filters.year! : "FIRST";
    const rows = program ? await prisma.subject.findMany({
      // General Education subjects have no program, so every college curriculum includes them read-only.
      where: { archivedAt: null, OR: [
        { yearLevel: year as never, OR: [{ programId: program.id }, { sharedPrograms: { some: { id: program.id } } }] },
        { level: "COLLEGE", programId: null, OR: [{ yearLevel: year as never }, { yearLevel: null }] },
      ] },
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
      include: { department: { select: { name: true } }, sharedPrograms: { select: { id: true, code: true, name: true } }, _count: { select: { schedules: true } } },
    }) : [];
    const terms = await prisma.semester.findMany({
      where: { level: "COLLEGE", OR: [{ programId: null }, ...(program ? [{ programId: program.id }] : [])] },
      orderBy: { startDate: "desc" },
      select: { id: true, name: true, type: true, isActive: true, academicYear: { select: { name: true } } },
    });
    const term = terms.find((t) => t.id === params.term) ?? terms.find((t) => t.isActive) ?? terms[0];
    // The term picked above decides which semester's subjects show, unless the person asked for every semester.
    const termFilter = { FIRST: "1", SECOND: "2", SUMMER: "MIDYEAR" } as const;
    const semesterFilter = params.semester === "ALL" ? null : filters.semester ?? (term ? termFilter[term.type as keyof typeof termFilter] : null);
    const actor = { role: scope.role, departmentId: scope.departmentId };
    const visible = filterSubjects(rows.filter((subject) => canViewSubject(actor, { ...subject, shared: !subject.programId })).map((subject) => ({ ...subject, sharedProgramIds: subject.sharedPrograms.map((p) => p.id) })), { ...filters, semester: semesterFilter }, scope.departmentId);
    const [assignments, sections, pool] = term && program ? await Promise.all([
      prisma.subjectAssignment.findMany({
        where: { semesterId: term.id, status: "ACTIVE", subjectId: { in: visible.map((s) => s.id) } },
        orderBy: { createdAt: "asc" },
        select: { id: true, subjectId: true, facultyId: true, sectionId: true, faculty: { select: { fullName: true } }, section: { select: { name: true } } },
      }),
      prisma.section.findMany({ where: { semesterId: term.id, programId: program.id, yearLevel: year as never, archivedAt: null }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } }),
      assignableFaculty(term.id),
    ]) : [[], [], null];
    const assign = term && pool ? { ...pool, sections, term: { id: term.id, label: `${term.name} ${term.academicYear.name}` }, terms: terms.map((t) => ({ value: t.id, label: `${t.name} ${t.academicYear.name}` })) } : null;
    // Newest subject change request this department filed for each subject, for the row badge.
    const requestRows = scope.departmentId ? await prisma.scheduleRequest.findMany({ where: { type: "SUBJECT_CHANGE", departmentId: scope.departmentId }, orderBy: { createdAt: "desc" }, select: { id: true, status: true, details: true } }) : [];
    const requestFor = new Map<string, SubjectRequestInfo>();
    for (const r of requestRows) {
      const details = r.details as unknown as SubjectRequestDetails;
      if (details.subjectId && !requestFor.has(details.subjectId)) requestFor.set(details.subjectId, { id: r.id, status: r.status, type: details.changeType });
    }
    const status: StatusFilter = (STATUS_FILTERS as readonly string[]).includes(params.status ?? "") ? (params.status as StatusFilter) : params.assigned === "none" ? "UNASSIGNED" : "ALL";
    const assignedTo = (subjectId: string) => assignments.filter((a) => a.subjectId === subjectId).map((a) => ({ id: a.id, facultyId: a.facultyId, facultyName: a.faculty.fullName, sectionId: a.sectionId, sectionName: a.section?.name ?? null }));
    const query = (patch: Record<string, string | null>) => { const next = new URLSearchParams(); Object.entries({ category: filters.category === "ALL" ? null : filters.category, semester: params.semester ?? null, owner: filters.owner === "ALL" ? null : filters.owner, program: program?.id, year, term: params.term ?? null, status: params.status ?? null, ...patch }).forEach(([key, value]) => value && next.set(key, value)); return `/subjects?${next}`; };
    return <div className="space-y-4">
      <PageHeader title="Subjects" description={`Complete curriculum for ${program?.name ?? "your department"}, including read-only General Education subjects.`} actions={<Link href={query({ showOther: "1" })} className="inline-flex h-8 items-center rounded-md border px-3 text-sm font-medium hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">Browse other levels and departments (read-only)</Link>} />
      <div className="flex flex-wrap items-center gap-2" aria-label="Curriculum selection">
        {programs.map((p) => <Link key={p.id} href={query({ program: p.id })} title={p.name} aria-current={p.id === program?.id ? "page" : undefined} className={cn("rounded-full border px-3 py-1.5 text-sm font-medium focus-visible:ring-2 focus-visible:ring-ring", p.id === program?.id && "border-primary bg-primary text-primary-foreground")}>{p.code}</Link>)}
        <span className="mx-1 h-5 border-l" aria-hidden />
        {validYears.map((value) => <Link key={value} href={query({ year: value })} aria-current={year === value ? "page" : undefined} className={cn("rounded-md px-2.5 py-1.5 text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring", year === value && "bg-muted font-semibold")}>{yearLabel(value)}</Link>)}
      </div>
      {program && <CurriculumList heading={`${program.code} · ${yearLabel(year)}`} context={{ level: "COLLEGE", programId: program.id, yearLevel: year, gradeLevel: "" }} subjects={visible.map((s) => ({ id: s.id, code: s.code, name: s.name, description: s.description ?? "", units: s.units, lectureHours: s.lectureHours, labHours: s.labHours, requiredRoomType: s.requiredRoomType, level: s.level, programId: s.programId ?? program.id, yearLevel: s.yearLevel ?? "", gradeLevel: s.gradeLevel ?? "", category: s.category, semester: s.semester, departmentId: s.departmentId, departmentName: s.department?.name ?? null, editable: canManageSubject(actor, s), classes: s._count.schedules, sharedPrograms: s.sharedPrograms, assignments: assignedTo(s.id), request: requestFor.get(s.id) ?? null }))} category={filters.category} owner={filters.owner} allSemesters={params.semester === "ALL"} status={status} otherLevelsHref={query({ showOther: "1" })} canCreate={!!scope.departmentId && program.departmentId === scope.departmentId} programOptions={programs.map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` }))} assign={assign} />}
    </div>;
  }

  const [all, programs] = await Promise.all([
    prisma.subject.findMany({ where: { archivedAt: null, ...(params.showOther === "1" ? {} : departmentWhere.subject(scope)) }, select: { level: true, programId: true, yearLevel: true, gradeLevel: true } }),
    prisma.program.findMany({ where: params.showOther === "1" ? {} : departmentWhere.program(scope), orderBy: [{ sortOrder: "asc" }, { code: "asc" }], select: { id: true, code: true, name: true, level: true } }),
  ]);

  let list: React.ReactNode = null;
  if (isComplete(flow) && flow.level) {
    const where =
      flow.level === "COLLEGE"
        ? {
            level: flow.level,
            programId: flow.programId === GENERAL ? null : flow.programId,
            yearLevel: flow.year === ANY_YEAR ? null : (flow.year as never),
          }
        : {
            level: flow.level,
            gradeLevel: flow.grade,
            ...(flow.strand ? { programId: flow.strand === "core" ? null : flow.strand } : {}),
          };
    const subjects = await prisma.subject.findMany({
      where: { ...where, archivedAt: null, ...(params.showOther === "1" ? {} : departmentWhere.subject(scope)) },
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
      include: { program: { select: { code: true } }, _count: { select: { schedules: true } } },
    });
    const strands = programs.filter((p) => p.level === "SENIOR_HIGH");
    const context = {
      level: flow.level,
      programId: flow.level === "COLLEGE" ? (flow.programId === GENERAL ? "" : (flow.programId ?? "")) : flow.strand && flow.strand !== "core" ? flow.strand : "",
      yearLevel: flow.year && flow.year !== ANY_YEAR ? flow.year : "",
      gradeLevel: flow.grade ?? "",
    };
    const heading =
      flow.level === "COLLEGE"
        ? `${flow.programId === GENERAL ? "General Education" : programs.find((p) => p.id === flow.programId)?.code} · ${flow.year === ANY_YEAR ? "Any year" : yearLabel(flow.year!)}`
        : `${LEVELS[flow.level].label} · ${gradeLabel(flow.grade!)}`;

    list = (
      <div className="space-y-3">
        {flow.level === "SENIOR_HIGH" && (
          <nav aria-label="Filter by strand" className="flex flex-wrap gap-1.5">
            {[{ id: null, code: "All" }, { id: "core", code: "Core (all strands)" }, ...strands].map((s) => (
              <Link
                key={s.code}
                href={flowHref("/subjects", { ...flow, strand: s.id })}
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
        <SubjectsList
          heading={heading}
          context={context}
          showStrand={flow.level === "SENIOR_HIGH"}
          strands={strands.map((s) => ({ value: s.id, label: `${s.code} — ${s.name}` }))}
          subjects={subjects.map((s) => ({
            id: s.id,
            code: s.code,
            name: s.name,
            description: s.description ?? "",
            units: s.units,
            lectureHours: s.lectureHours,
            labHours: s.labHours,
            requiredRoomType: s.requiredRoomType,
            level: s.level,
            programId: s.programId ?? "",
            strand: s.program?.code ?? null,
            yearLevel: s.yearLevel ?? "",
            gradeLevel: s.gradeLevel ?? "",
            classes: s._count.schedules,
            // General Education subjects are shared; only the Registrar edits them.
            editable: scope.isAdmin || s.departmentId === scope.departmentId,
          }))}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Subjects"
        description="Pick a level and year or grade to manage its subjects, units, and weekly hours."
        actions={
          <Link href="/import?kind=subjects" className="inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-sm font-medium hover:bg-muted">
            Import subjects in bulk
          </Link>
        }
      />
      {scope.role === "HEAD_OF_DEPARTMENT" && params.showOther === "1" && (
        <p role="note" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border bg-muted/50 px-4 py-3 text-sm">
          <span>You are browsing other levels and departments. Rows are read-only unless your department owns them.</span>
          <Link href="/subjects" className="font-medium text-primary underline-offset-2 hover:underline">Back to my curriculum</Link>
        </p>
      )}
      <LevelFlow
        basePath="/subjects"
        rootLabel="Subjects"
        noun="subjects"
        flow={flow}
        rows={all}
        programs={programs}
        allowGeneral
        allowAnyYear
      />
      {list}
    </div>
  );
}
