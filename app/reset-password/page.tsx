import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { Button } from "@/components/ui/button";
import { findValidToken } from "@/lib/auth/tokens";

export const metadata = { title: "Reset Password · GCST Scheduling" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token = "" } = await searchParams;
  const record = await findValidToken(token, "PASSWORD_RESET");

  if (!record) {
    return (
      <AuthShell title="Link expired" description="This password reset link is invalid, already used, or has expired.">
        <Button className="w-full" nativeButton={false} render={<Link href="/forgot-password" />}>
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
      <ResetPasswordForm token={token} />
    </AuthShell>
  );
}
