"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { signOut } from "next-auth/react";
import { Hourglass, SignOut } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { watchIdleSession, type IdleSessionState } from "@/lib/auth/idle-session";

export function IdleSession({ sessionKey, student = false }: { sessionKey: string; student?: boolean }) {
  const [state, setState] = useState<IdleSessionState>({ status: "active" });
  const [error, setError] = useState<string | null>(null);
  const watcher = useRef<ReturnType<typeof watchIdleSession> | null>(null);
  const signingOut = useRef(false);
  const continueButton = useRef<HTMLButtonElement>(null);

  const logout = useCallback(async () => {
    if (signingOut.current) return;
    signingOut.current = true;
    try {
      const result = await signOut({ redirect: false, callbackUrl: `${student ? "/student/login" : "/login"}?notice=idle` });
      if (!result?.url) throw new Error("Sign-out did not complete.");
      window.location.replace(result.url);
    } catch {
      signingOut.current = false;
      setError("We couldn’t complete sign-out. Check your connection and try again.");
    }
  }, [student]);

  useEffect(() => {
    const current = watchIdleSession({ sessionKey, onChange: (next) => {
      setState(next);
      if (next.status === "expired") void logout();
    } });
    watcher.current = current;
    return () => { current.stop(); watcher.current = null; };
  }, [sessionKey, logout]);

  return <AlertDialog open={state.status !== "active"} onOpenChange={(open, details) => { if (!open) details.cancel(); }}>
    <AlertDialogContent initialFocus={continueButton} className="z-[100] sm:max-w-md">
      <AlertDialogHeader className="gap-3">
        <span className="flex size-12 items-center justify-center rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300"><Hourglass className="size-6" aria-hidden /></span>
        <AlertDialogTitle className="text-xl font-semibold">{state.status === "expired" ? "Session timed out" : "Hey are you still there?"}</AlertDialogTitle>
        <AlertDialogDescription>{state.status === "expired" ? "You’ve been inactive. Signing you out…" : "You haven’t been active for 5 minutes. Choose “I’m still here” to keep working."}</AlertDialogDescription>
      </AlertDialogHeader>
      {state.status === "warning" && <p role="timer" aria-label={`Signing out in ${state.secondsRemaining} seconds`} className="rounded-lg bg-muted px-4 py-3 text-center text-sm">Signing out in <span className="font-semibold tabular-nums">{state.secondsRemaining}</span> seconds</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <AlertDialogFooter>
        {state.status !== "expired" ? <>
          <Button type="button" variant="outline" onClick={() => watcher.current?.expire()}><SignOut className="size-4" aria-hidden />Sign out now</Button>
          <Button ref={continueButton} type="button" onClick={() => watcher.current?.renew()}>I’m still here</Button>
        </> : error ? <Button type="button" onClick={() => { setError(null); void logout(); }}>Retry sign-out</Button> : <Button type="button" disabled>Signing out…</Button>}
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}
