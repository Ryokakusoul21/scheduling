"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { CircleNotch, SignOut } from "@phosphor-icons/react/ssr";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogTitle } from "@/components/ui/alert-dialog";

export function SignOutConfirmation({ open, onOpenChange, callbackUrl, beforeSignOut }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  callbackUrl: string;
  beforeSignOut?: () => Promise<void>;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const signingOut = useRef(false);
  const cancelButton = useRef<HTMLButtonElement>(null);

  async function confirm() {
    if (signingOut.current) return;
    signingOut.current = true;
    setPending(true);
    setError(null);
    try {
      await beforeSignOut?.();
      await signOut({ callbackUrl });
      router.refresh();
    } catch {
      setError("We couldn’t log you out. Please try again.");
    } finally {
      signingOut.current = false;
      setPending(false);
    }
  }

  return <AlertDialog open={open} onOpenChange={(next, details) => {
    if (signingOut.current) return details.cancel();
    setError(null);
    onOpenChange(next);
  }}>
    <AlertDialogContent initialFocus={cancelButton} aria-busy={pending} className="gap-7 rounded-3xl p-7 shadow-2xl shadow-black/15 data-[size=default]:max-w-[calc(100%-2rem)] data-[size=default]:sm:max-w-[440px] sm:p-8">
      <div className="flex flex-col items-center text-center">
        <span className="mb-6 flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/15">
          <SignOut aria-hidden className="size-8" weight="duotone" />
        </span>
        <AlertDialogTitle className="text-2xl leading-tight font-semibold tracking-tight sm:text-[26px]">Log out of your account?</AlertDialogTitle>
        <AlertDialogDescription className="mt-3 max-w-[32ch] text-[15px] leading-relaxed">
          You’ll need to sign in again to return to your workspace.
        </AlertDialogDescription>
      </div>
      {error && <p role="alert" className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</p>}
      <div className="grid grid-cols-1 gap-3 min-[380px]:grid-cols-2">
        <AlertDialogCancel ref={cancelButton} disabled={pending} className="h-12 rounded-xl px-4 text-sm font-semibold">Stay signed in</AlertDialogCancel>
        <AlertDialogAction disabled={pending} onClick={confirm} className="h-12 gap-2 rounded-xl bg-brand-blue px-4 text-sm font-semibold text-white shadow-sm hover:bg-brand-blue/90">
          {pending ? <CircleNotch aria-hidden className="size-[18px] animate-spin" /> : <SignOut aria-hidden className="size-[18px]" />}
          {pending ? "Logging out…" : "Log out"}
        </AlertDialogAction>
      </div>
    </AlertDialogContent>
  </AlertDialog>;
}
