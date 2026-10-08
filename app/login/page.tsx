import { redirect } from "next/navigation";
import { CheckCircle } from "@phosphor-icons/react/ssr";
import { LoginForm } from "@/components/auth/login-form";
import { AuthShell } from "@/components/auth/auth-shell";
import { auth } from "@/auth";
import { homeForRole, type AppRole } from "@/lib/permissions/roles";

export const metadata = { title: "Sign In · GCST Scheduling" };

const NOTICES: Record<string, string> = {
  registered: "Account created. Check your email for a verification link.",
  verified: "Email verified. You can now sign in.",
  reset: "Your password has been reset. Sign in with your new password.",
  changed: "Password changed. Please sign in again.",
  signedout: "You've been signed out of all devices.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; notice?: string }>;
}) {
  const session = await auth();
  if (session?.user) redirect(homeForRole(session.user.role as AppRole));

  const { callbackUrl, notice } = await searchParams;
  const message = notice ? NOTICES[notice] : undefined;

  return (
    <AuthShell title="Welcome back" description="Sign in to the GCST Scheduling System">
      {message && (
        <div role="status" className="mb-4 flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm">
          <CheckCircle className="mt-0.5 size-4 shrink-0 text-emerald-600" />
          <p>{message}</p>
        </div>
      )}
      <LoginForm callbackUrl={callbackUrl} />
    </AuthShell>
  );
}
