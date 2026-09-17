import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { SemestersManager } from "./manager";

export const metadata = { title: "Semesters · GCST Scheduling" };

export default async function SemestersPage() {
  await requireRole("SUPER_ADMIN", "ADMINISTRATOR", "REGISTRAR");
  const [semesters, years] = await Promise.all([
    prisma.semester.findMany({ include: { academicYear: true }, orderBy: { startDate: "desc" } }),
    prisma.academicYear.findMany({ orderBy: { startDate: "desc" } }),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Semesters</h1>
        <p className="text-sm text-muted-foreground">Manage first, second, and summer terms for each academic year.</p>
      </div>

      <SemestersManager
        semesters={semesters.map((s) => ({
          id: s.id,
          academicYearId: s.academicYearId,
          academicYearLabel: s.academicYear.name,
          type: s.type,
          name: s.name,
          startDate: s.startDate.toISOString().slice(0, 10),
          endDate: s.endDate.toISOString().slice(0, 10),
          isActive: s.isActive ? "true" : "false",
        }))}
        years={years.map((y) => ({ id: y.id, label: y.name }))}
      />
    </div>
  );
}
