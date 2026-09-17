import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { SectionsManager } from "./manager";

export const metadata = { title: "Sections · GCST Scheduling" };

export default async function SectionsPage() {
  await requireRole("SUPER_ADMIN", "ADMINISTRATOR", "REGISTRAR", "SCHEDULER");
  const [sections, programs, semesters] = await Promise.all([
    prisma.section.findMany({
      include: { program: true, semester: { include: { academicYear: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.program.findMany({ orderBy: { code: "asc" } }),
    prisma.semester.findMany({ include: { academicYear: true }, orderBy: { startDate: "desc" } }),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Sections</h1>
        <p className="text-sm text-muted-foreground">Class sections grouped by program, year level, and semester.</p>
      </div>

      <SectionsManager
        sections={sections.map((s) => ({
          id: s.id,
          name: s.name,
          programId: s.programId,
          programLabel: s.program.code,
          yearLevel: s.yearLevel,
          studentCount: String(s.studentCount),
          semesterId: s.semesterId ?? "",
          semesterLabel: s.semester ? `${s.semester.academicYear.name} · ${s.semester.name}` : "Unassigned",
        }))}
        programs={programs.map((p) => ({ id: p.id, label: p.code }))}
        semesters={semesters.map((s) => ({ id: s.id, label: `${s.academicYear.name} · ${s.name}` }))}
      />
    </div>
  );
}
