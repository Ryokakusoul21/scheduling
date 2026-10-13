import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { STAFF_ROLES } from "@/lib/permissions/roles";
import { YearsManager } from "./years-manager";

export const metadata = { title: "Academic Years & Terms · GRANBY COLLEGES OF SCIENCE & TECHNOLOGY" };

export default async function AcademicYearsPage() {
  await requireRole(...STAFF_ROLES);
  const years = await prisma.academicYear.findMany({
    orderBy: { startDate: "desc" },
    include: { semesters: { select: { level: true, isActive: true } } },
  });

  return (
    <YearsManager
      years={years.map((y) => ({
        id: y.id,
        name: y.name,
        startDate: y.startDate.toISOString().slice(0, 10),
        endDate: y.endDate.toISOString().slice(0, 10),
        isActive: y.isActive,
        termCount: y.semesters.length,
        levelsConfigured: new Set(y.semesters.map((s) => s.level)).size,
        activeTerms: y.semesters.filter((s) => s.isActive).length,
      }))}
    />
  );
}
