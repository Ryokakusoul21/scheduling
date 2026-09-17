import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { AiSchedulerPanel } from "@/components/scheduler/ai-scheduler-panel";

export const metadata = { title: "AI Auto Scheduler · GCST Scheduling" };

export default async function AiSchedulerPage() {
  await requireRole("SUPER_ADMIN", "ADMINISTRATOR", "SCHEDULER");

  const [semesters, sections] = await Promise.all([
    prisma.semester.findMany({
      include: { academicYear: true },
      orderBy: [{ academicYear: { startDate: "desc" } }, { startDate: "asc" }],
    }),
    prisma.section.findMany({
      include: { program: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">AI-Powered Schedule Generator</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Generate optimized academic schedules automatically using constraints, faculty
          availability, room capacity, and academic requirements.
        </p>
      </div>

      <AiSchedulerPanel
        semesters={semesters.map((s) => ({
          id: s.id,
          label: `${s.academicYear.name} · ${s.name}`,
          isActive: s.isActive,
        }))}
        sections={sections.map((s) => ({
          id: s.id,
          name: s.name,
          program: s.program.code,
          studentCount: s.studentCount,
        }))}
      />
    </div>
  );
}
