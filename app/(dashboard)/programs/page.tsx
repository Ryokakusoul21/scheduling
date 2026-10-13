import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { STAFF_ROLES } from "@/lib/permissions/roles";
import { ProgramsManager } from "./programs-manager";

export const metadata = { title: "Programs & Strands · GRANBY COLLEGES OF SCIENCE & TECHNOLOGY" };

export default async function ProgramsPage() {
  await requireRole(...STAFF_ROLES);
  const [programs, departments] = await Promise.all([
    prisma.program.findMany({
      where: { level: { in: ["COLLEGE", "SENIOR_HIGH"] } },
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
      include: {
        department: { select: { code: true, name: true } },
        _count: { select: { sections: true, subjects: true, semesters: true } },
      },
    }),
    prisma.department.findMany({ orderBy: { code: "asc" } }),
  ]);

  return (
    <ProgramsManager
      programs={programs.map((p) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        level: p.level as "COLLEGE" | "SENIOR_HIGH",
        departmentId: p.departmentId ?? "",
        department: p.department ? `${p.department.code} — ${p.department.name}` : null,
        sections: p._count.sections,
        subjects: p._count.subjects,
        terms: p._count.semesters,
      }))}
      departments={departments.map((d) => ({ value: d.id, label: `${d.code} — ${d.name}` }))}
    />
  );
}
