import { PROGRAM_CATALOG_FILTER } from "@/lib/academics/levels";
import { Suspense } from "react";
import { prisma } from "@/lib/db/prisma";
import { policyUserFromScope, requireScope } from "@/lib/permissions/scope";
import { can } from "@/lib/permissions/policy";
import { departmentWhere } from "@/lib/permissions/department";
import { STAFF_ROLES } from "@/lib/permissions/roles";
import { DEFAULT_LEVEL, LevelTabs } from "@/components/academics/level-tabs";
import { headLevels } from "@/lib/academics/department-levels";
import { isAcademicLevel } from "@/lib/academics/levels";
import { ProfileSection } from "../department/profile-section";
import { ProgramsManager } from "./programs-manager";
import { ProgramsReadOnly } from "./programs-readonly";
import { AcademicYearsSection } from "../academic-years/years-section";
import { SectionSkeleton } from "@/components/dashboard/overview/kit";

export const metadata = { title: "Academic Record · GRANBY COLLEGES OF SCIENCE AND TECHNOLOGY" };

export default async function ProgramsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const scope = await requireScope(...STAFF_ROLES);
  // A Head of Department with a single-level department gets no level tabs.
  const own = await headLevels(scope);
  const single = own?.length === 1 ? own[0] : null;
  const active = single ?? (isAcademicLevel(params.level) ? params.level : DEFAULT_LEVEL);
  const [programs, departments] = await Promise.all([
    prisma.program.findMany({
      where: { AND: [PROGRAM_CATALOG_FILTER, departmentWhere.program(scope)] },
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
      include: {
        department: { select: { code: true, name: true } },
        _count: { select: { sections: true, subjects: true, semesters: true } },
      },
    }),
    prisma.department.findMany({ where: departmentWhere.department(scope), orderBy: { code: "asc" } }),
  ]);

  const counts = { COLLEGE: programs.filter((p) => p.level === "COLLEGE").length, SENIOR_HIGH: programs.filter((p) => p.level === "SENIOR_HIGH").length };
  const rows = programs.filter((p) => p.level === active).map((p) => ({
    id: p.id,
    code: p.code,
    name: p.name,
    level: p.level as "COLLEGE" | "SENIOR_HIGH",
    departmentId: p.departmentId ?? "",
    department: p.department?.name ?? null,
    sections: p._count.sections,
    subjects: p._count.subjects,
    terms: p._count.semesters,
  }));

  // Heads manage their department profile on the same page; the Registrar uses Departments.
  const profile = scope.role === "HEAD_OF_DEPARTMENT" ? <ProfileSection scope={scope} /> : null;
  const tabs = single ? null : <LevelTabs basePath="/programs" active={active} params={params} noun="programs" counts={counts} />;

  // The same policy the actions enforce decides which view is shown.
  const who = policyUserFromScope(scope);
  if (!can(who, "create", { type: "programCatalog" })) {
    return (
      <div className="space-y-4">
        {profile}
        {tabs}
        <ProgramsReadOnly
          programs={rows}
          departments={departments.map((d) => ({ id: d.id, name: d.name, canRename: can(who, "rename", { type: "department", id: d.id, departmentId: d.id }) }))}
        />
      </div>
    );
  }

  return <div className="space-y-6">
    {profile}
    {scope.isAdmin && <section id="academic-calendar" className="scroll-mt-6"><Suspense fallback={<SectionSkeleton rows={3} />}><AcademicYearsSection /></Suspense></section>}
    <section className="space-y-4 border-t pt-6">
      {tabs}
      <ProgramsManager programs={rows} activeLevel={active} departments={departments.map((d) => ({ value: d.id, label: d.name }))} />
    </section>
  </div>;
}
