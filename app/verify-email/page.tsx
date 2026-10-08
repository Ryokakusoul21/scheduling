import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { verifyEmailToken } from "@/actions/auth";

export const metadata = { title: "Verify Email · GCST Scheduling" };

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token = "" } = await searchParams;
  const result = await verifyEmailToken(token);

  if (!result.ok) {
    return (
      <AuthShell
        title="Verification failed"
        description="This verification link is invalid, already used, or has expired. Sign in to request a new one."
      >
        <Button className="w-full" nativeButton={false} render={<Link href="/login" />}>
          Back to sign in
        </Button>
      </AuthShell>
    );
  }

  if (result.pending) {
    return (
      <AuthShell
        title="Email verified"
        description="Thanks! Your account is now awaiting administrator approval. We'll email you once it's approved."
      >
        <Button variant="outline" className="w-full" nativeButton={false} render={<Link href="/login" />}>
          Back to sign in
        </Button>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Email verified" description="Your email address has been confirmed. You can now sign in.">
      <Button className="w-full" nativeButton={false} render={<Link href="/login?notice=verified" />}>
        Continue to sign in
      </Button>
    </AuthShell>
  );
}
