import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { SetPasswordForm } from "./form";

export const metadata = { title: "Set New Password · GRANBY COLLEGES OF SCIENCE AND TECHNOLOGY" };

export default async function ChangePasswordPage() {
  const user = await requireUser();
  const account = await prisma.user.findUnique({ where: { id: user.id }, select: { mustChangePassword: true } });
  if (!account?.mustChangePassword) redirect("/dashboard");
  return (
    <AuthShell title="Set a new password" description="Required before first use.">
      <SetPasswordForm />
    </AuthShell>
  );
}
