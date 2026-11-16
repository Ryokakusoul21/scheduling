"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/auth/password-input";
import { PasswordStrength } from "@/components/auth/password-strength";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { setOwnPasswordAction } from "./actions";

export function SetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form action={(fd) => start(async () => {
      setError(null);
      const res = await setOwnPasswordAction({ password: String(fd.get("password") ?? ""), confirmPassword: String(fd.get("confirmPassword") ?? "") });
      if (res.ok) router.replace("/dashboard"); else setError(res.error);
    })}>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="password">New password</FieldLabel>
          <PasswordInput id="password" name="password" autoComplete="new-password" autoFocus required value={password} onChange={(e) => setPassword(e.target.value)} />
          <PasswordStrength password={password} />
        </Field>
        <Field>
          <FieldLabel htmlFor="confirmPassword">Confirm new password</FieldLabel>
          <PasswordInput id="confirmPassword" name="confirmPassword" autoComplete="new-password" required />
        </Field>
        {error && <p role="alert" className="text-sm font-medium text-destructive">{error}</p>}
        <Button type="submit" className="w-full" disabled={pending}>Save password</Button>
      </FieldGroup>
    </form>
  );
}
