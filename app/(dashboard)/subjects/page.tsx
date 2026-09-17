import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { SubjectsManager } from "./manager";

export const metadata = { title: "Subjects · GCST Scheduling" };

export default async function SubjectsPage() {
  await requireRole("SUPER_ADMIN", "ADMINISTRATOR", "REGISTRAR", "SCHEDULER");
  const [subjects, programs] = await Promise.all([
    prisma.subject.findMany({ include: { program: true }, orderBy: { code: "asc" } }),
    prisma.program.findMany({ orderBy: { code: "asc" } }),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Subjects</h1>
        <p className="text-sm text-muted-foreground">Curriculum subjects with units, hours, and room requirements.</p>
      </div>

      <SubjectsManager
        subjects={subjects.map((s) => ({
          id: s.id,
          code: s.code,
          name: s.name,
          description: s.description ?? "",
          units: String(s.units),
          lectureHours: String(s.lectureHours),
          labHours: String(s.labHours),
          requiredRoomType: s.requiredRoomType,
          programId: s.programId ?? "",
          yearLevel: s.yearLevel ?? "",
          programLabel: s.program?.code ?? "General Ed.",
        }))}
        programs={programs.map((p) => ({ id: p.id, label: p.code }))}
      />
    </div>
  );
}
