import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { AcademicYearsManager } from "./manager";

export const metadata = { title: "Academic Years · GCST Scheduling" };

export default async function AcademicYearsPage() {
  await requireRole("SUPER_ADMIN", "ADMINISTRATOR", "REGISTRAR");
  const years = await prisma.academicYear.findMany({ orderBy: { startDate: "desc" } });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Academic Years</h1>
        <p className="text-sm text-muted-foreground">Manage the institution&apos;s academic year calendar.</p>
      </div>

      <AcademicYearsManager
        years={years.map((y) => ({
          id: y.id,
          name: y.name,
          startDate: y.startDate.toISOString().slice(0, 10),
          endDate: y.endDate.toISOString().slice(0, 10),
          isActive: y.isActive ? "true" : "false",
        }))}
      />
    </div>
  );
}
