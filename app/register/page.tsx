import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AuthShell } from "@/components/auth/auth-shell";
import { RegisterForm } from "@/components/auth/register-form";
import { requiresAdminApproval } from "@/actions/auth";
import { homePath } from "@/lib/permissions/roles";

export const metadata = { title: "Create Account · GRANBY COLLEGES OF SCIENCE AND TECHNOLOGY" };

export default async function RegisterPage() {
  const session = await auth();
  if (session?.user) redirect(homePath(session.user.role));

  return (
    <AuthShell title="Create an account" description="Register for access to the AI-Driven Faculty and Room Scheduling System of GRANBY COLLEGES OF SCIENCE AND TECHNOLOGY">
      <RegisterForm requiresApproval={await requiresAdminApproval()} />
    </AuthShell>
  );
}
