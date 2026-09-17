import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { StudentsManager } from "./manager";

export const metadata = { title: "Students · GCST Scheduling" };

export default async function StudentsPage() {
  await requireRole("SUPER_ADMIN", "ADMINISTRATOR", "REGISTRAR");
  const [students, programs, sections] = await Promise.all([
    prisma.student.findMany({
      include: { program: true, section: true },
      orderBy: { fullName: "asc" },
      take: 200,
    }),
    prisma.program.findMany({ orderBy: { code: "asc" } }),
    prisma.section.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Students</h1>
        <p className="text-sm text-muted-foreground">
          Student roster ({students.length} shown, most recent 200). Use search/filters on larger cohorts.
        </p>
      </div>

      <StudentsManager
        students={students.map((s) => ({
          id: s.id,
          studentNumber: s.studentNumber,
          fullName: s.fullName,
          email: s.email,
          programId: s.programId ?? "",
          programLabel: s.program?.code ?? "—",
          yearLevel: s.yearLevel ?? "",
          sectionId: s.sectionId ?? "",
          sectionLabel: s.section?.name ?? "Unassigned",
          status: s.status,
        }))}
        programs={programs.map((p) => ({ id: p.id, label: p.code }))}
        sections={sections.map((s) => ({ id: s.id, label: s.name }))}
      />
    </div>
  );
}
