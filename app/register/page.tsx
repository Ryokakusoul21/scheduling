import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AuthShell } from "@/components/auth/auth-shell";
import { RegisterForm } from "@/components/auth/register-form";
import { requiresAdminApproval } from "@/actions/auth";
import { HOME_PATH } from "@/lib/permissions/roles";

export const metadata = { title: "Create Account · GRANBY COLLEGES OF SCIENCE & TECHNOLOGY" };

export default async function RegisterPage() {
  const session = await auth();
  if (session?.user) redirect(HOME_PATH);

  return (
    <AuthShell title="Create an account" description="Register for access to the GRANBY COLLEGES OF SCIENCE & TECHNOLOGY Scheduling System">
      <RegisterForm requiresApproval={await requiresAdminApproval()} />
    </AuthShell>
  );
}
