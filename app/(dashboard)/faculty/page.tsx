import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { STAFF_ROLES } from "@/lib/permissions/roles";
import { FacultyBrowser } from "./faculty-browser";

export const metadata = { title: "Faculty · GRANBY COLLEGES OF SCIENCE & TECHNOLOGY" };

export default async function FacultyPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireRole(...STAFF_ROLES);
  const { q } = await searchParams;
  const [faculty, departments] = await Promise.all([
    prisma.faculty.findMany({
      include: {
        department: { select: { code: true, name: true } },
        // Teaching load counts classes in currently active terms only.
        schedules: { where: { status: { not: "ARCHIVED" }, semester: { isActive: true } }, select: { startMin: true, endMin: true } },
      },
      orderBy: { fullName: "asc" },
    }),
    prisma.department.findMany({ orderBy: { code: "asc" } }),
  ]);

  return (
    <FacultyBrowser
      initialQuery={q ?? ""}
      departments={departments.map((d) => ({ value: d.id, label: `${d.code} — ${d.name}` }))}
      faculty={faculty.map((f) => ({
        id: f.id,
        employeeId: f.employeeId,
        fullName: f.fullName,
        email: f.email,
        position: f.position ?? "",
        specialization: f.specialization ?? "",
        departmentId: f.departmentId ?? "",
        department: f.department?.code ?? null,
        maxHours: f.maxHours,
        status: f.status,
        teachingLevels: f.teachingLevels,
        loadHours: Math.round((f.schedules.reduce((s, e) => s + (e.endMin - e.startMin), 0) / 60) * 10) / 10,
        classes: f.schedules.length,
      }))}
    />
  );
}
