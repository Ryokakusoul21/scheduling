"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, CircleNotch, Copy, DownloadSimple, ShieldCheck, ShieldSlash } from "@phosphor-icons/react/ssr";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  confirmTwoFactorAction,
  disableTwoFactorAction,
  regenerateRecoveryCodesAction,
  startTwoFactorSetupAction,
} from "@/app/(dashboard)/profile/actions";
import { cn } from "cn";
import { OtpInput } from "./otp-input";
import { PasswordField } from "./password-field";

type View = "idle" | "scan" | "verify" | "codes" | "disable" | "regenerate";

const STEPS = ["Scan QR code", "Enter code", "Save recovery codes"];

async function copy(text: string, done: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(done);
  } catch {
    toast.error("Could not copy. Select the text and copy it manually.");
  }
}

function Stepper({ current }: { current: number }) {
  return (
    <ol className="flex flex-wrap gap-x-6 gap-y-2" aria-label="Setup progress">
      {STEPS.map((label, i) => (
        <li key={label} aria-current={i === current ? "step" : undefined} className="flex items-center gap-2 text-sm">
          <span
            className={cn(
              "flex size-6 items-center justify-center rounded-full text-xs font-semibold",
              i < current ? "bg-emerald-700 text-white" : i === current ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
            )}
          >
            {i < current ? <Check className="size-3.5" weight="bold" /> : i + 1}
          </span>
          <span className={i === current ? "font-medium" : "text-muted-foreground"}>{label}</span>
        </li>
      ))}
    </ol>
  );
}

export function TwoFactorCard({ enabled, recoveryLeft }: { enabled: boolean; recoveryLeft: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [view, setView] = useState<View>("idle");
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [codes, setCodes] = useState<string[]>([]);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  // True from the first setup step until the recovery codes are saved, so regenerating codes shows no stepper.
  const [inSetup, setInSetup] = useState(false);

  function reset() {
    setView("idle");
    setSetup(null);
    setCode("");
    setPassword("");
    setError(null);
    setSaved(false);
    setInSetup(false);
  }

  function begin() {
    start(async () => {
      const res = await startTwoFactorSetupAction();
      if (!res.ok) return void toast.error(res.error);
      setSetup({ secret: res.secret, qr: res.qr });
      setInSetup(true);
      setView("scan");
    });
  }

  function verify() {
    setError(null);
    start(async () => {
      const res = await confirmTwoFactorAction(code);
      if (!res.ok) {
        setError(res.error);
        setCode("");
        return;
      }
      toast.success("Two-factor authentication enabled");
      setSetup(null);
      setCodes(res.codes);
      setCode("");
      setView("codes");
    });
  }

  function regenerate() {
    setError(null);
    start(async () => {
      const res = await regenerateRecoveryCodesAction(password);
      if (!res.ok) return setError(res.error);
      setPassword("");
      setCodes(res.codes);
      setView("codes");
    });
  }

  function disable() {
    setError(null);
    start(async () => {
      const res = await disableTwoFactorAction(password, code);
      if (!res.ok) {
        setError(res.error);
        setCode("");
        return;
      }
      toast.success("Two-factor authentication disabled");
      reset();
      router.refresh();
    });
  }

  function download() {
    const text = `GRANBY COLLEGES OF SCIENCE & TECHNOLOGY recovery codes\nEach code works once.\n\n${codes.join("\n")}\n`;
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    Object.assign(document.createElement("a"), { href: url, download: "recovery-codes.txt" }).click();
    URL.revokeObjectURL(url);
  }

  const groupedKey = setup?.secret.match(/.{1,4}/g)?.join(" ") ?? "";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-lg">
          Two-factor authentication
          {enabled ? (
            <Badge className="gap-1 bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100">
              <ShieldCheck className="size-3.5" weight="fill" /> On
            </Badge>
          ) : (
            <Badge variant="secondary" className="gap-1">
              <ShieldSlash className="size-3.5" /> Off
            </Badge>
          )}
        </CardTitle>
        <CardDescription className="text-sm">
          Require a 6-digit code from an authenticator app (Google Authenticator, Microsoft Authenticator, Authy) when signing in.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {view === "idle" && !enabled && (
          <Button onClick={begin} disabled={pending} className="h-10">
            {pending ? <CircleNotch className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />} Set up two-factor authentication
          </Button>
        )}

        {view === "idle" && enabled && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Your account is protected. {recoveryLeft} recovery {recoveryLeft === 1 ? "code" : "codes"} left.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" className="h-10" onClick={() => setView("regenerate")}>New recovery codes</Button>
              <Button variant="outline" className="h-10 text-destructive hover:text-destructive" onClick={() => setView("disable")}>
                Disable two-factor authentication
              </Button>
            </div>
          </div>
        )}

        {inSetup && view !== "idle" && <Stepper current={view === "scan" ? 0 : view === "verify" ? 1 : 2} />}

        {view === "scan" && setup && (
          <div className="space-y-4">
            <div className="grid gap-5 sm:grid-cols-[auto_1fr] sm:items-center">
              {/* eslint-disable-next-line @next/next/no-img-element -- data URL */}
              <img src={setup.qr} alt="Two-factor setup QR code" width={200} height={200} className="mx-auto rounded-lg border bg-white p-2" />
              <div className="space-y-2">
                <p className="text-sm">Scan the code with your authenticator app. Cannot scan? Enter this key instead:</p>
                <p className="rounded-lg border bg-muted/40 p-3 font-mono text-base tracking-wider break-words">{groupedKey}</p>
                <Button variant="outline" size="sm" onClick={() => copy(setup.secret, "Key copied")}>
                  <Copy className="size-4" /> Copy key
                </Button>
              </div>
            </div>
            <div className="flex gap-2">
              <Button className="h-10" onClick={() => setView("verify")}>Next</Button>
              <Button variant="ghost" className="h-10" onClick={reset}>Cancel</Button>
            </div>
          </div>
        )}

        {view === "verify" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <p id="otp-help" className="text-sm">Enter the 6-digit code shown in your authenticator app.</p>
              <OtpInput value={code} onChange={setCode} label="Verification code" invalid={!!error} describedBy={error ? "otp-error" : "otp-help"} autoFocus />
              <p id="otp-error" role="alert" className="min-h-5 text-sm text-destructive">{error}</p>
            </div>
            <div className="flex gap-2">
              <Button className="h-10" onClick={verify} disabled={pending || code.length !== 6}>
                {pending && <CircleNotch className="size-4 animate-spin" />} Verify
              </Button>
              <Button variant="outline" className="h-10" onClick={() => (setError(null), setCode(""), setView("scan"))}>Back</Button>
            </div>
          </div>
        )}

        {view === "codes" && (
          <div className="space-y-4">
            <p className="text-sm">
              Keep these recovery codes somewhere safe. Each one signs you in once if you lose your authenticator. They will not be shown again.
            </p>
            <ul className="grid max-w-md grid-cols-2 gap-2 rounded-lg border bg-muted/40 p-3 font-mono text-base">
              {codes.map((c) => <li key={c}>{c}</li>)}
            </ul>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => copy(codes.join("\n"), "Recovery codes copied")}>
                <Copy className="size-4" /> Copy
              </Button>
              <Button variant="outline" size="sm" onClick={download}>
                <DownloadSimple className="size-4" /> Download
              </Button>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} className="size-4 accent-primary" />
              I have saved these codes
            </label>
            <Button className="h-10" disabled={!saved} onClick={() => (reset(), setCodes([]), router.refresh())}>Done</Button>
          </div>
        )}

        {(view === "disable" || view === "regenerate") && (
          <div className="max-w-sm space-y-4">
            <Field>
              <FieldLabel htmlFor="confirm-password" className="text-sm">Confirm your password</FieldLabel>
              <PasswordField id="confirm-password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            {view === "disable" && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Authenticator code</p>
                <OtpInput value={code} onChange={setCode} label="Authenticator code" invalid={!!error} />
              </div>
            )}
            <p role="alert" className="min-h-5 text-sm text-destructive">{error}</p>
            <div className="flex gap-2">
              {view === "disable" ? (
                <Button variant="destructive" className="h-10" onClick={disable} disabled={pending || !password || code.length !== 6}>
                  {pending && <CircleNotch className="size-4 animate-spin" />} Disable
                </Button>
              ) : (
                <Button className="h-10" onClick={regenerate} disabled={pending || !password}>
                  {pending && <CircleNotch className="size-4 animate-spin" />} Generate new codes
                </Button>
              )}
              <Button variant="ghost" className="h-10" onClick={reset}>Cancel</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
