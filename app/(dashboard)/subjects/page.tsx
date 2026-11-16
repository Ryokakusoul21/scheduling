import Link from "next/link";
import { cn } from "@/lib/utils";
import { prisma } from "@/lib/db/prisma";
import { offeringMatches } from "@/lib/subjects/offerings";
import { policyUserFromScope, requireScope } from "@/lib/permissions/scope";
import { policyDepartmentIds } from "@/lib/permissions/policy";
import { departmentWhere } from "@/lib/permissions/department";
import { STAFF_ROLES } from "@/lib/permissions/roles";
import { ANY_YEAR, GENERAL, flowHref, isComplete, parseFlow } from "@/lib/academics/flow";
import { PROGRAM_CATALOG_FILTER, LEVELS, gradeLabel, yearLabel } from "@/lib/academics/levels";
import { LevelFlow } from "@/components/academics/level-flow";
import { headLevels } from "@/lib/academics/department-levels";
import { DEFAULT_LEVEL, LevelTabs } from "@/components/academics/level-tabs";
import { PageHeader } from "@/components/ux/states";
import { SubjectsList } from "./subjects-list";
import { CurriculumList } from "./curriculum-list";
import { canManageSubject, canViewSubject } from "@/lib/subjects/permissions";
import { filterSubjects, parseSubjectFilters } from "@/lib/subjects/filters";
import { assignableFaculty } from "@/lib/subjects/assignments";
import { curriculumProgramWhere } from "@/lib/subjects/curriculum";
import { STATUS_FILTERS, type StatusFilter } from "@/lib/subjects/status";
import type { SubjectRequestDetails } from "@/lib/subjects/request-rules";
import type { SubjectRequestInfo } from "./types";
import { subjectCalendarSelect } from "@/lib/subjects/term-calendar";
import { filterSubjectSemester, selectedSubjectSemester, subjectSemesterOptions, subjectTerms } from "@/lib/subjects/terms";
import { SubjectSemesterFilter } from "./semester-filter";

export const metadata = { title: "Subjects · GRANBY COLLEGES OF SCIENCE AND TECHNOLOGY" };

export default async function SubjectsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const scope = await requireScope(...STAFF_ROLES);
  const params = await searchParams;
  // Levels are never combined: the page always shows exactly one level, College by default.
  // A Head of Department with a single-level department gets no level tabs.
  const own = await headLevels(scope);
  const single = own?.length === 1 ? own[0] : null;
  const flow = parseFlow({ ...params, level: single ?? params.level ?? DEFAULT_LEVEL });
  const calendar = flow.level === "COLLEGE" ? await prisma.academicYear.findFirst({
    where: { isActive: true }, orderBy: { startDate: "desc" }, select: subjectCalendarSelect,
  }) : null;
  // At the course selection step, offer every configured semester type once.
  const semesterOptions = flow.programId
    ? subjectSemesterOptions(calendar, flow.programId === GENERAL ? null : flow.programId)
    : [...new Map((calendar?.semesters ?? []).map((t) => [t.type, { value: t.type, label: t.name }])).values()]
      .sort((a, b) => ["FIRST", "SECOND", "SUMMER"].indexOf(a.value) - ["FIRST", "SECOND", "SUMMER"].indexOf(b.value));
  const selectedSemester = selectedSubjectSemester(semesterOptions, params.semester);
  const calendarFilter = flow.level === "COLLEGE" ? <SubjectSemesterFilter academicYear={calendar?.name ?? null} options={semesterOptions} semester={selectedSemester} /> : null;

  const hasBasicPrograms = scope.role === "HEAD_OF_DEPARTMENT" && await prisma.program.count({ where: { ...departmentWhere.program(scope), level: "SENIOR_HIGH" } }) > 0;
  if (scope.role === "HEAD_OF_DEPARTMENT" && params.showOther !== "1" && !hasBasicPrograms && (!flow.level || flow.level === "COLLEGE")) {
    const programSelect = { id: true, code: true, name: true, departmentId: true } as const;
    let programs = await prisma.program.findMany({ where: { departmentId: scope.departmentId, level: "COLLEGE" }, orderBy: [{ sortOrder: "asc" }, { code: "asc" }], select: programSelect });
    // A department without college programs (General Education) sees every curriculum and manages only the subjects it owns.
    if (!programs.length) programs = await prisma.program.findMany({ where: { level: "COLLEGE" }, orderBy: [{ sortOrder: "asc" }, { code: "asc" }], select: programSelect });
    const filters = parseSubjectFilters(params, true);
    const program = programs.find((p) => p.id === filters.program) ?? programs[0];
    const validYears = ["FIRST", "SECOND", "THIRD", "FOURTH"] as const;
    const year = validYears.includes(filters.year as never) ? filters.year! : "FIRST";
    const rows = program ? await prisma.subject.findMany({
      where: { archivedAt: null, level: "COLLEGE", AND: [curriculumProgramWhere(program.id), { OR: [{ yearLevel: year as never }, { yearLevel: null }] }] },
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
      include: { department: { select: { name: true } }, sharedPrograms: { select: { id: true, code: true, name: true } }, _count: { select: { schedules: true } } },
    }) : [];
    const terms = subjectTerms(calendar, program?.id ?? null);
    const headSemester = selectedSubjectSemester(subjectSemesterOptions(calendar, program?.id ?? null), params.semester ?? terms.find((t) => t.id === params.term)?.type ?? terms.find((t) => t.isActive)?.type);
    const term = terms.find((t) => t.type === headSemester) ?? terms.find((t) => t.isActive) ?? terms[0];
    const actor = policyUserFromScope(scope);
    const visible = filterSubjectSemester(filterSubjects(rows.filter((subject) => canViewSubject(actor, { ...subject, shared: !subject.programId }) && (!subject.semester || terms.some((t) => t.type === subject.semester))).map((subject) => ({ ...subject, sharedProgramIds: subject.sharedPrograms.map((p) => p.id) })), { ...filters, semester: null }, scope.departmentId), headSemester);
    const [assignments, sections, pool, meetings, pendingApprovals] = term && program ? await Promise.all([
      prisma.subjectAssignment.findMany({
        where: { semesterId: term.id, status: "ACTIVE", subjectId: { in: visible.map((s) => s.id) } },
        orderBy: { createdAt: "asc" },
        select: { id: true, subjectId: true, facultyId: true, sectionId: true, faculty: { select: { fullName: true } }, section: { select: { name: true } } },
      }),
      prisma.section.findMany({ where: { AND: [departmentWhere.section(scope), { semesterId: term.id, programId: program.id, yearLevel: year as never, archivedAt: null }] }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], include: { classPlaceholders: { select: { subjectId: true } } } }),
      assignableFaculty(term.id),
      prisma.schedule.findMany({ where: { semesterId: term.id, status: { not: "ARCHIVED" }, section: { programId: program.id, yearLevel: year as never } }, select: { subjectId: true, sectionId: true, startMin: true, endMin: true } }),
      prisma.subjectAssignmentProposal.findMany({ where: { semesterId: term.id, status: "PENDING", subjectId: { in: visible.map((s) => s.id) }, section: { AND: [departmentWhere.section(scope), { programId: program.id, yearLevel: year as never }] } }, select: { subjectId: true, sectionId: true, faculty: { select: { fullName: true } }, reviewDepartment: { select: { name: true } } } }),
    ]) : [[], [], null, [], []];
    const assignmentScope = { departmentIds: policyDepartmentIds(actor), inactiveFacultyCount: await prisma.faculty.count({ where: { departmentId: { in: policyDepartmentIds(actor) }, archivedAt: null, status: "INACTIVE" } }) };
    const assign = term && pool ? { ...pool, assignmentScope, sections, term: { id: term.id, label: `${term.name} ${calendar?.name}` }, terms: terms.map((t) => ({ value: t.id, label: `${t.name} ${calendar?.name}` })) } : null;
    // Newest subject change request this department filed for each subject, for the row badge.
    const requestRows = scope.role === "HEAD_OF_DEPARTMENT" && scope.departmentId ? await prisma.scheduleRequest.findMany({ where: { type: "SUBJECT_CHANGE", departmentId: scope.departmentId }, orderBy: { createdAt: "desc" }, select: { id: true, status: true, details: true } }) : [];
    const requestFor = new Map<string, SubjectRequestInfo>();
    for (const r of requestRows) {
      const details = r.details as unknown as SubjectRequestDetails;
      if (details.subjectId && !requestFor.has(details.subjectId)) requestFor.set(details.subjectId, { id: r.id, status: r.status, type: details.changeType });
    }
    const status: StatusFilter = (STATUS_FILTERS as readonly string[]).includes(params.status ?? "") ? (params.status as StatusFilter) : params.assigned === "none" ? "UNASSIGNED" : "ALL";
    const assignedTo = (subjectId: string) => assignments.filter((a) => a.subjectId === subjectId && sections.some((s) => s.id === a.sectionId)).map((a) => ({ id: a.id, facultyId: a.facultyId, facultyName: a.faculty.fullName, sectionId: a.sectionId, sectionName: a.section?.name ?? null }));
    const offeringInfo = (subject: (typeof visible)[number]) => ({
      pendingApprovals: pendingApprovals.filter((p) => p.subjectId === subject.id).map((p) => ({ sectionId: p.sectionId, facultyName: p.faculty.fullName, departmentName: p.reviewDepartment.name })),
      eligibleSectionIds: term ? sections.filter((s) => offeringMatches(subject, { ...s, curriculum: s.classPlaceholders }, { id: term.id, type: term.type, level: "COLLEGE" })).map((s) => s.id) : [],
      progress: sections.map((s) => ({ sectionId: s.id, scheduledHours: meetings.filter((m) => m.subjectId === subject.id && m.sectionId === s.id).reduce((sum, m) => sum + Math.max(0, m.endMin - m.startMin) / 60, 0) })),
    });
    const query = (patch: Record<string, string | null>) => { const next = new URLSearchParams(); Object.entries({ category: filters.category === "ALL" ? null : filters.category, semester: headSemester, owner: filters.owner === "ALL" ? null : filters.owner, program: program?.id, year, term: params.term ?? null, status: params.status ?? null, ...patch }).forEach(([key, value]) => value && next.set(key, value)); return `/subjects?${next}`; };
    return <div className="space-y-4">
      <PageHeader title="Subjects" description={`Complete curriculum for ${program?.name ?? "your department"}, including read-only General Education subjects.`} actions={<Link href={query({ showOther: "1" })} className="inline-flex h-8 items-center rounded-md border px-3 text-sm font-medium hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">Browse other levels and departments (read-only)</Link>} />
      <div className="flex flex-wrap items-center gap-2" aria-label="Curriculum selection">
        <SubjectSemesterFilter academicYear={calendar?.name ?? null} options={subjectSemesterOptions(calendar, program?.id ?? null)} semester={headSemester} />
        {programs.map((p) => <Link key={p.id} href={query({ program: p.id })} title={p.name} aria-current={p.id === program?.id ? "page" : undefined} className={cn("rounded-full border px-3 py-1.5 text-sm font-medium focus-visible:ring-2 focus-visible:ring-ring", p.id === program?.id && "border-primary bg-primary text-primary-foreground")}>{p.code}</Link>)}
        <span className="mx-1 h-5 border-l" aria-hidden />
        {validYears.map((value) => <Link key={value} href={query({ year: value })} aria-current={year === value ? "page" : undefined} className={cn("rounded-md px-2.5 py-1.5 text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring", year === value && "bg-muted font-semibold")}>{yearLabel(value)}</Link>)}
      </div>
      {program && <CurriculumList calendar={calendar} heading={`${program.code} · ${yearLabel(year)}`} context={{ level: "COLLEGE", programId: program.id, yearLevel: year, gradeLevel: "" }} subjects={visible.map((s) => ({ id: s.id, code: s.code, name: s.name, description: s.description ?? "", units: s.units, lectureHours: s.lectureHours, labHours: s.labHours, requiredRoomType: s.requiredRoomType, level: s.level, programId: s.programId ?? program.id, yearLevel: s.yearLevel ?? "", gradeLevel: s.gradeLevel ?? "", category: s.category, semester: s.semester, departmentId: s.departmentId, departmentName: s.department?.name ?? null, editable: canManageSubject(actor, s), classes: s._count.schedules, sharedPrograms: s.sharedPrograms, assignments: assignedTo(s.id), ...offeringInfo(s), request: requestFor.get(s.id) ?? null }))} category={filters.category} owner={filters.owner} allSemesters={headSemester === "ALL"} status={status} otherLevelsHref={query({ showOther: "1" })} canCreate={!!scope.departmentId && program.departmentId === scope.departmentId} programOptions={programs.map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` }))} assign={assign} />}
    </div>;
  }

  const [all, programs] = await Promise.all([
    prisma.subject.findMany({ where: { archivedAt: null, ...(params.showOther === "1" ? {} : departmentWhere.subject(scope)) }, select: { level: true, semester: true, programId: true, yearLevel: true, gradeLevel: true, sharedPrograms: { select: { id: true } } } }),
    prisma.program.findMany({ where: { AND: [PROGRAM_CATALOG_FILTER, params.showOther === "1" ? {} : departmentWhere.program(scope)] }, orderBy: [{ sortOrder: "asc" }, { code: "asc" }], select: { id: true, code: true, name: true, level: true } }),
  ]);
  const countedSubjects = filterSubjectSemester(all, selectedSemester);

  let list: React.ReactNode = null;
  if (isComplete(flow) && flow.level) {
    const where =
      flow.level === "COLLEGE"
        ? {
            level: flow.level,
            ...(flow.programId === GENERAL ? { programId: null } : curriculumProgramWhere(flow.programId!)),
            yearLevel: flow.year === ANY_YEAR ? null : (flow.year as never),
          }
        : {
            level: flow.level,
            gradeLevel: flow.grade,
            ...(flow.strand ? { programId: flow.strand === "core" ? null : flow.strand } : {}),
          };
    const subjects = await prisma.subject.findMany({
      where: { AND: [where, { archivedAt: null }, params.showOther === "1" ? {} : departmentWhere.subject(scope)] },
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
          calendar={calendar}
          defaultSemester={selectedSemester === "ALL" ? undefined : selectedSemester}
          heading={heading}
          context={context}
          showStrand={flow.level === "SENIOR_HIGH"}
          strands={strands.map((strand) => ({ value: strand.id, label: `${strand.code} - ${strand.name}` }))}
          subjects={filterSubjectSemester(subjects, selectedSemester).map((s) => ({
            id: s.id,
            code: s.code,
            name: s.name,
            description: s.description ?? "",
            units: s.units,
            lectureHours: s.lectureHours,
            labHours: s.labHours,
            semester: s.semester,
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
        description="Manage subject curricula by academic level, course, and year level."
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
      {!single && <LevelTabs basePath="/subjects" active={flow.level ?? DEFAULT_LEVEL} params={params} noun="subjects" counts={Object.fromEntries(Object.keys(LEVELS).map((l) => [l, countedSubjects.filter((r) => r.level === l).length]))} />}
      {calendarFilter}
      {flow.level === "COLLEGE" && !flow.programId && <p className="text-sm text-muted-foreground">Counts follow the semester filter. The College total counts each subject once. Course totals include applicable shared subjects, so they can overlap.</p>}
      <LevelFlow
        basePath="/subjects"
        queryParams={{ semester: selectedSemester, ...(params.showOther ? { showOther: params.showOther } : {}) }}
        rootLabel="Subjects"
        noun="subjects"
        flow={flow}
        rows={countedSubjects}
        programs={programs}
        allowGeneral
        allowAnyYear
      />
      {list}
    </div>
  );
}
