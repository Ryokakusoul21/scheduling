import { redirect } from "next/navigation";
import Link from "next/link";
import { CheckCircle } from "@phosphor-icons/react/ssr";
import { auth } from "@/auth";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";
import { homePath } from "@/lib/permissions/roles";

export const metadata = { title: "Student Sign In · GRANBY COLLEGES OF SCIENCE & TECHNOLOGY" };

const NOTICES: Record<string, string> = {
  verified: "Email verified. You can now sign in.",
  reset: "Your password has been reset. Sign in with your new password.",
};

export default async function StudentLoginPage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string; notice?: string }> }) {
  const session = await auth();
  if (session?.user) redirect(homePath(session.user.role));
  const { callbackUrl, notice } = await searchParams;
  const message = notice ? NOTICES[notice] : undefined;

  return (
    <AuthShell title="Student sign in" description="View your class timetable, rooms, and school activities.">
      {message && (
        <div role="status" className="mb-4 flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm">
          <CheckCircle className="mt-0.5 size-4 shrink-0 text-emerald-600" />
          <p>{message}</p>
        </div>
      )}
      <LoginForm callbackUrl={callbackUrl} audience="student" />
      <p className="mt-6 text-center text-xs text-muted-foreground">
        Faculty, Head of Department, or Administrator?{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Staff sign in
        </Link>
      </p>
    </AuthShell>
  );
}
