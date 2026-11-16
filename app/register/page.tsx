import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AuthShell } from "@/components/auth/auth-shell";
import { RegisterForm } from "@/components/auth/register-form";
import { requiresAdminApproval } from "@/actions/auth";
import { homePath } from "@/lib/permissions/roles";
import { prisma } from "@/lib/db/prisma";

export const metadata = { title: "Create Account · GRANBY COLLEGES OF SCIENCE AND TECHNOLOGY" };

export default async function RegisterPage() {
  const session = await auth();
  if (session?.user) redirect(homePath(session.user.role));

  const [requiresApproval, departments] = await Promise.all([
    requiresAdminApproval(),
    prisma.department.findMany({ select: { id: true, code: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <AuthShell title="Create account" wide>
      <RegisterForm requiresApproval={requiresApproval} departments={departments} />
    </AuthShell>
  );
}
