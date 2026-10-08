"use client";

import { useState, useTransition } from "react";
import { signOut } from "next-auth/react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { ShieldCheck } from "@phosphor-icons/react/ssr";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";
import { PasswordStrength } from "@/components/auth/password-strength";
import { changePasswordSchema, type ChangePasswordInput } from "@/lib/validation/auth";
import {
  changePasswordAction,
  confirmTwoFactorAction,
  disableTwoFactorAction,
  signOutEverywhereAction,
  startTwoFactorSetupAction,
} from "./actions";

export function SecuritySettings({ twoFactorEnabled }: { twoFactorEnabled: boolean }) {
  return (
    <>
      <ChangePasswordCard />
      <TwoFactorCard enabled={twoFactorEnabled} />
      <SessionsCard />
    </>
  );
}

function ChangePasswordCard() {
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: "", password: "", confirmPassword: "" },
  });

  const password = useWatch({ control, name: "password" });

  async function onSubmit(values: ChangePasswordInput) {
    const res = await changePasswordAction(values);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Password changed. Please sign in again.");
    await signOut({ callbackUrl: "/login?notice=changed" });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Change password</CardTitle>
        <CardDescription>Changing your password signs you out of every device.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="max-w-sm">
          <FieldGroup>
            <Field data-invalid={!!errors.currentPassword}>
              <FieldLabel htmlFor="currentPassword">Current password</FieldLabel>
              <Input id="currentPassword" type="password" autoComplete="current-password" {...register("currentPassword")} />
              <FieldError errors={[errors.currentPassword]} />
            </Field>
            <Field data-invalid={!!errors.password}>
              <FieldLabel htmlFor="newPassword">New password</FieldLabel>
              <Input id="newPassword" type="password" autoComplete="new-password" {...register("password")} />
              <PasswordStrength password={password} />
              <FieldError errors={[errors.password]} />
            </Field>
            <Field data-invalid={!!errors.confirmPassword}>
              <FieldLabel htmlFor="confirmNewPassword">Confirm new password</FieldLabel>
              <Input id="confirmNewPassword" type="password" autoComplete="new-password" {...register("confirmPassword")} />
              <FieldError errors={[errors.confirmPassword]} />
            </Field>
            <Button type="submit" disabled={isSubmitting} className="w-fit">
              Update password
            </Button>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}

function TwoFactorCard({ enabled }: { enabled: boolean }) {
  const [pending, startTransition] = useTransition();
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [disabling, setDisabling] = useState(false);

  function begin() {
    startTransition(async () => {
      const res = await startTwoFactorSetupAction();
      if (res.ok) setSetup({ secret: res.secret, qr: res.qr });
      else toast.error(res.error);
    });
  }

  function confirm() {
    startTransition(async () => {
      const res = await confirmTwoFactorAction(code);
      if (!res.ok) return void toast.error(res.error);
      toast.success("Two-factor authentication enabled.");
      setSetup(null);
      setCode("");
    });
  }

  function disable() {
    startTransition(async () => {
      const res = await disableTwoFactorAction(password, code);
      if (!res.ok) return void toast.error(res.error);
      toast.success("Two-factor authentication disabled.");
      setDisabling(false);
      setPassword("");
      setCode("");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Two-factor authentication
          {enabled ? <Badge>On</Badge> : <Badge variant="secondary">Off</Badge>}
        </CardTitle>
        <CardDescription>
          Require a 6-digit code from an authenticator app (Google Authenticator, Microsoft Authenticator, Authy) when
          signing in.
        </CardDescription>
      </CardHeader>
      <CardContent className="max-w-sm space-y-3">
        {!enabled && !setup && (
          <Button onClick={begin} disabled={pending}>
            <ShieldCheck className="size-4" /> Set up 2FA
          </Button>
        )}

        {!enabled && setup && (
          <div className="space-y-3">
            <p className="text-sm">1. Scan this QR code with your authenticator app.</p>
            {/* eslint-disable-next-line @next/next/no-img-element -- data URL */}
            <img src={setup.qr} alt="2FA QR code" width={200} height={200} className="rounded-md border bg-white p-1" />
            <p className="text-xs text-muted-foreground">
              Can&apos;t scan? Enter this key manually: <code className="font-mono break-all">{setup.secret}</code>
            </p>
            <p className="text-sm">2. Enter the 6-digit code it shows.</p>
            <div className="flex gap-2">
              <Input
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
              <Button onClick={confirm} disabled={pending || code.length !== 6}>
                Verify
              </Button>
            </div>
          </div>
        )}

        {enabled && !disabling && (
          <Button variant="outline" onClick={() => setDisabling(true)}>
            Disable 2FA
          </Button>
        )}

        {enabled && disabling && (
          <div className="space-y-2">
            <Input type="password" placeholder="Current password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <Input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="Authenticator code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            <div className="flex gap-2">
              <Button variant="destructive" onClick={disable} disabled={pending || !password || code.length !== 6}>
                Disable 2FA
              </Button>
              <Button variant="ghost" onClick={() => setDisabling(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SessionsCard() {
  const [pending, startTransition] = useTransition();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sessions</CardTitle>
        <CardDescription>Sign out of every browser and device where your account is signed in, including this one.</CardDescription>
      </CardHeader>
      <CardContent>
        <Button
          variant="outline"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await signOutEverywhereAction();
              await signOut({ callbackUrl: "/login?notice=signedout" });
            })
          }
        >
          Sign out of all devices
        </Button>
      </CardContent>
    </Card>
  );
}
