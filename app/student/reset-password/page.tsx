import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { Button } from "@/components/ui/button";
import { findValidToken } from "@/lib/auth/tokens";

export const metadata = { title: "Student Reset Password · GRANBY COLLEGES OF SCIENCE & TECHNOLOGY" };

export default async function StudentResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  const record = await findValidToken(token, "PASSWORD_RESET");

  // Staff reset links only work on the staff page.
  if (!record || record.user.role !== "STUDENT") {
    return (
      <AuthShell title="Link expired" description="This password reset link is invalid, already used, or has expired.">
        <Button className="w-full" nativeButton={false} render={<Link href="/student/forgot-password" />}>
          Request a new reset link
        </Button>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Choose a new password"
      description={<>Resetting the password for <span className="font-medium text-foreground">{record.user.email}</span></>}
    >
      <ResetPasswordForm token={token} audience="student" />
    </AuthShell>
  );
}
