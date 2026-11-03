"use client";

import { signOut } from "next-auth/react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { CheckCircle, Circle, CircleNotch, Warning } from "@phosphor-icons/react/ssr";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { PasswordStrength } from "@/components/auth/password-strength";
import { changePasswordSchema, type ChangePasswordInput } from "@/lib/validation/auth";
import { changePasswordAction } from "@/app/(dashboard)/profile/actions";
import { cn } from "cn";
import { PasswordField } from "./password-field";

const RULES: [string, (pw: string) => boolean][] = [
  ["At least 8 characters", (p) => p.length >= 8],
  ["One uppercase letter", (p) => /[A-Z]/.test(p)],
  ["One lowercase letter", (p) => /[a-z]/.test(p)],
  ["One number", (p) => /\d/.test(p)],
  ["One symbol", (p) => /[^A-Za-z0-9]/.test(p)],
];

export function PasswordCard() {
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting, isValid },
  } = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    mode: "onChange",
    defaultValues: { currentPassword: "", password: "", confirmPassword: "" },
  });
  const [password, confirm] = useWatch({ control, name: ["password", "confirmPassword"] });

  async function onSubmit(values: ChangePasswordInput) {
    const res = await changePasswordAction(values);
    if (!res.ok) return void toast.error(res.error);
    toast.success("Password changed. Please sign in again.");
    await signOut({ callbackUrl: "/login?notice=changed" });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Change password</CardTitle>
        <CardDescription className="text-sm">Choose a strong password you do not use anywhere else.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <Alert>
          <Warning className="size-4" />
          <AlertDescription className="text-sm">Changing your password signs you out of every device, including this one.</AlertDescription>
        </Alert>
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="max-w-[420px]">
          <FieldGroup>
            <Field data-invalid={!!errors.currentPassword}>
              <FieldLabel htmlFor="currentPassword" className="text-sm">Current password</FieldLabel>
              <PasswordField id="currentPassword" autoComplete="current-password" aria-invalid={!!errors.currentPassword} {...register("currentPassword")} />
            </Field>
            <Field data-invalid={!!errors.password}>
              <FieldLabel htmlFor="newPassword" className="text-sm">New password</FieldLabel>
              <PasswordField id="newPassword" autoComplete="new-password" aria-describedby="password-rules" {...register("password")} />
              <PasswordStrength password={password} />
              <ul id="password-rules" className="grid gap-1 text-sm sm:grid-cols-2">
                {RULES.map(([label, test]) => {
                  const ok = test(password);
                  return (
                    <li key={label} className={cn("flex items-center gap-1.5", ok ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground")}>
                      {ok ? <CheckCircle className="size-4" weight="fill" /> : <Circle className="size-4" />}
                      {label}
                      <span className="sr-only">{ok ? " met" : " not met"}</span>
                    </li>
                  );
                })}
              </ul>
            </Field>
            <Field data-invalid={!!errors.confirmPassword}>
              <FieldLabel htmlFor="confirmNewPassword" className="text-sm">Confirm new password</FieldLabel>
              <PasswordField id="confirmNewPassword" autoComplete="new-password" aria-describedby="confirm-status" {...register("confirmPassword")} />
              <p id="confirm-status" aria-live="polite" className={cn("min-h-5 text-sm", confirm && (confirm === password ? "text-emerald-700 dark:text-emerald-400" : "text-destructive"))}>
                {confirm ? (confirm === password ? "Passwords match" : "Passwords do not match") : ""}
              </p>
              <FieldError errors={[errors.confirmPassword]} />
            </Field>
            <Button type="submit" disabled={!isValid || isSubmitting} className="h-10 w-fit px-5">
              {isSubmitting && <CircleNotch className="size-4 animate-spin" />} Update password
            </Button>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
