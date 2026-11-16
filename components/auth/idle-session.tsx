"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { signOut } from "next-auth/react";
import { Hourglass, SignOut } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { AUTH } from "@/lib/auth/config";
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

  const total = Math.max(1, Math.round(AUTH.idleSignOutGraceMs / 1000));
  const left = state.status === "warning" ? state.secondsRemaining : 0;
  const ring = 2 * Math.PI * 34;

  return <AlertDialog open={state.status !== "active"} onOpenChange={(open, details) => { if (!open) details.cancel(); }}>
    <AlertDialogContent initialFocus={continueButton} className="z-[100] gap-5 p-6 text-center sm:max-w-sm">
      <div className="relative mx-auto size-20" role="timer" aria-label={state.status === "warning" ? `Signing out in ${left} seconds` : "Signing out"}>
        <svg viewBox="0 0 80 80" className="size-20 -rotate-90" aria-hidden>
          <circle cx="40" cy="40" r="34" className="fill-none stroke-muted" strokeWidth="6" />
          <circle cx="40" cy="40" r="34" className="fill-none stroke-primary transition-[stroke-dashoffset] duration-1000 ease-linear" strokeWidth="6" strokeLinecap="round"
            strokeDasharray={ring} strokeDashoffset={ring * (1 - left / total)} />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-2xl font-semibold tabular-nums">{state.status === "warning" ? left : <Hourglass className="size-7 text-muted-foreground" aria-hidden />}</span>
      </div>
      <AlertDialogHeader className="items-center gap-1 text-center">
        <AlertDialogTitle className="text-lg font-semibold">{state.status === "expired" ? "Session timed out" : "Still there?"}</AlertDialogTitle>
        <AlertDialogDescription>{state.status === "expired" ? "Signing you out" : "Inactive for 5 minutes"}</AlertDialogDescription>
      </AlertDialogHeader>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-col gap-2">
        {state.status !== "expired" ? <>
          <Button ref={continueButton} type="button" size="lg" className="w-full" onClick={() => watcher.current?.renew()}>I’m still here</Button>
          <Button type="button" variant="ghost" size="sm" className="mx-auto text-muted-foreground" onClick={() => watcher.current?.expire()}><SignOut className="size-4" aria-hidden />Sign out</Button>
        </> : error ? <Button type="button" className="w-full" onClick={() => { setError(null); void logout(); }}>Retry sign-out</Button> : <Button type="button" className="w-full" disabled>Signing out…</Button>}
      </div>
    </AlertDialogContent>
  </AlertDialog>;
}
