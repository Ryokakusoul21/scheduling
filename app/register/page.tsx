import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AuthShell } from "@/components/auth/auth-shell";
import { RegisterForm } from "@/components/auth/register-form";
import { requiresAdminApproval } from "@/actions/auth";
import { homeForRole, type AppRole } from "@/lib/permissions/roles";

export const metadata = { title: "Create Account · GCST Scheduling" };

export default async function RegisterPage() {
  const session = await auth();
  if (session?.user) redirect(homeForRole(session.user.role as AppRole));

  return (
    <AuthShell title="Create an account" description="Register for access to the GCST Scheduling System">
      <RegisterForm requiresApproval={await requiresAdminApproval()} />
    </AuthShell>
  );
}
