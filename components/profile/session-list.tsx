"use client";

import { useState, useTransition } from "react";
import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CircleNotch, DesktopTower, DeviceMobile } from "@phosphor-icons/react/ssr";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { revokeSessionAction, signOutEverywhereAction } from "@/app/(dashboard)/profile/actions";

export interface SessionRow {
  id: string;
  device: string;
  location: string;
  signedIn: string;
  lastActive: string;
  current: boolean;
}

export function SessionList({ sessions }: { sessions: SessionRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirmAll, setConfirmAll] = useState(false);

  function revoke(s: SessionRow) {
    start(async () => {
      const res = await revokeSessionAction(s.id);
      if (!res.ok) return void toast.error(res.error);
      if (s.current) return void (await signOut({ callbackUrl: "/login?notice=signedout" }));
      toast.success(`Signed out ${s.device}`);
      router.refresh();
    });
  }

  function revokeAll() {
    start(async () => {
      await signOutEverywhereAction();
      await signOut({ callbackUrl: "/login?notice=signedout" });
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Sessions &amp; devices</CardTitle>
        <CardDescription className="text-sm">Browsers and devices where your account is signed in. Sign out any you do not recognize.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {sessions.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            No tracked sessions yet. Sessions started from now on will be listed here.
          </p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {sessions.map((s) => {
              const Icon = /iOS|Android/.test(s.device) ? DeviceMobile : DesktopTower;
              return (
                <li key={s.id} className="flex flex-wrap items-center gap-3 p-3 sm:p-4">
                  <Icon className="size-7 shrink-0 text-muted-foreground" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-base font-medium">
                      {s.device}
                      {s.current && <Badge>This device</Badge>}
                    </p>
                    <p className="text-sm text-muted-foreground">{s.location} · Active {s.lastActive}</p>
                    <p className="text-sm text-muted-foreground">Signed in {s.signedIn}</p>
                  </div>
                  <Button variant="outline" size="sm" disabled={pending} onClick={() => revoke(s)}>
                    {s.current ? "Sign out" : "Revoke"}
                    <span className="sr-only"> {s.device}</span>
                  </Button>
                </li>
              );
            })}
          </ul>
        )}

        <Button variant="destructive" className="h-10" disabled={pending} onClick={() => setConfirmAll(true)}>
          Sign out of all devices
        </Button>

        <AlertDialog open={confirmAll} onOpenChange={setConfirmAll}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Sign out of all devices?</AlertDialogTitle>
              <AlertDialogDescription>
                Every browser and device, including this one, will be signed out and asked to sign in again.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={revokeAll} disabled={pending}>
                {pending && <CircleNotch className="size-4 animate-spin" />} Sign out everywhere
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
