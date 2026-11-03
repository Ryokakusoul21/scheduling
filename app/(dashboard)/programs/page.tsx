import { prisma } from "@/lib/db/prisma";
import { policyUserFromScope, requireScope } from "@/lib/permissions/scope";
import { can } from "@/lib/permissions/policy";
import { departmentWhere } from "@/lib/permissions/department";
import { STAFF_ROLES } from "@/lib/permissions/roles";
import { ProgramsManager } from "./programs-manager";
import { ProgramsReadOnly } from "./programs-readonly";

export const metadata = { title: "Programs and Strands · GRANBY COLLEGES OF SCIENCE & TECHNOLOGY" };

export default async function ProgramsPage() {
  const scope = await requireScope(...STAFF_ROLES);
  const [programs, departments] = await Promise.all([
    prisma.program.findMany({
      where: { level: { in: ["COLLEGE", "SENIOR_HIGH"] }, ...departmentWhere.program(scope) },
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
      include: {
        department: { select: { code: true, name: true } },
        _count: { select: { sections: true, subjects: true, semesters: true } },
      },
    }),
    prisma.department.findMany({ where: departmentWhere.department(scope), orderBy: { code: "asc" } }),
  ]);

  const rows = programs.map((p) => ({
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

  // The same policy the actions enforce decides which view is shown.
  const who = policyUserFromScope(scope);
  if (!can(who, "create", { type: "programCatalog" })) {
    return (
      <ProgramsReadOnly
        programs={rows}
        departments={departments.map((d) => ({ id: d.id, name: d.name, canRename: can(who, "rename", { type: "department", id: d.id, departmentId: d.id }) }))}
      />
    );
  }

  return <ProgramsManager programs={rows} departments={departments.map((d) => ({ value: d.id, label: d.name }))} />;
}
