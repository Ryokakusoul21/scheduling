import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { ADMIN_ROLES } from "@/lib/permissions/roles";
import { YearsManager } from "./years-manager";

/** Calendar management shares the programs workspace while retaining its administrator-only access. */
export async function AcademicYearsSection() {
  await requireRole(...ADMIN_ROLES);
  const years = await prisma.academicYear.findMany({
    orderBy: { startDate: "desc" },
    include: { semesters: { select: { level: true, isActive: true } } },
  });
  return <YearsManager embedded years={years.map((year) => ({
    id: year.id,
    name: year.name,
    startDate: year.startDate.toISOString().slice(0, 10),
    endDate: year.endDate.toISOString().slice(0, 10),
    isActive: year.isActive,
    termCount: year.semesters.length,
    levelsConfigured: new Set(year.semesters.map((term) => term.level)).size,
    activeTerms: year.semesters.filter((term) => term.isActive).length,
  }))} />;
}
