import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { ProgramsManager } from "./manager";

export const metadata = { title: "Programs · GCST Scheduling" };

export default async function ProgramsPage() {
  await requireRole("SUPER_ADMIN", "ADMINISTRATOR", "REGISTRAR");
  const [programs, departments] = await Promise.all([
    prisma.program.findMany({ include: { department: true }, orderBy: { code: "asc" } }),
    prisma.department.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Programs</h1>
        <p className="text-sm text-muted-foreground">Degree programs offered across departments.</p>
      </div>

      <ProgramsManager
        programs={programs.map((p) => ({
          id: p.id,
          code: p.code,
          name: p.name,
          departmentId: p.departmentId,
          departmentLabel: p.department.name,
        }))}
        departments={departments.map((d) => ({ id: d.id, label: d.name }))}
      />
    </div>
  );
}
