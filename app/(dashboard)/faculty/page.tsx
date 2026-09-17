import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { FacultyManager } from "./manager";

export const metadata = { title: "Faculty · GCST Scheduling" };

export default async function FacultyPage() {
  await requireRole("SUPER_ADMIN", "ADMINISTRATOR", "REGISTRAR");
  const [faculty, departments] = await Promise.all([
    prisma.faculty.findMany({
      include: { department: true, schedules: { select: { startMin: true, endMin: true } } },
      orderBy: { fullName: "asc" },
    }),
    prisma.department.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Faculty</h1>
        <p className="text-sm text-muted-foreground">Faculty roster, workload, and specialization.</p>
      </div>

      <FacultyManager
        faculty={faculty.map((f) => {
          const assignedHours = f.schedules.reduce((s, e) => s + (e.endMin - e.startMin), 0) / 60;
          return {
            id: f.id,
            employeeId: f.employeeId,
            fullName: f.fullName,
            email: f.email,
            departmentId: f.departmentId ?? "",
            departmentLabel: f.department?.name ?? "—",
            position: f.position ?? "",
            specialization: f.specialization ?? "",
            maxHours: String(f.maxHours),
            status: f.status,
            utilization: Math.round((assignedHours / Math.max(f.maxHours, 1)) * 100),
            assignedHours: assignedHours.toFixed(1),
          };
        })}
        departments={departments.map((d) => ({ id: d.id, label: d.name }))}
      />
    </div>
  );
}
