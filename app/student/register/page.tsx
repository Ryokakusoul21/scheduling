import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { AuthShell } from "@/components/auth/auth-shell";
import { StudentRegisterForm } from "@/components/auth/student-register-form";
import { homePath } from "@/lib/permissions/roles";
import { registrableSections } from "@/lib/students/sections";

export const metadata = { title: "Student Registration · GRANBY COLLEGES OF SCIENCE & TECHNOLOGY" };

export default async function StudentRegisterPage() {
  const session = await auth();
  if (session?.user) redirect(homePath(session.user.role));
  const [programs, sections] = await Promise.all([
    prisma.program.findMany({ orderBy: [{ level: "desc" }, { sortOrder: "asc" }], select: { id: true, code: true, name: true } }),
    registrableSections(),
  ]);

  return (
    <AuthShell title="Create a student account" description="Register to view your section's timetable and school activities.">
      <StudentRegisterForm programs={programs.map((p) => ({ value: p.id, label: `${p.code} - ${p.name}` }))} sections={sections} />
    </AuthShell>
  );
}
