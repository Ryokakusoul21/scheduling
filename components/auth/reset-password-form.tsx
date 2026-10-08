"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CircleNotch as Loader2 } from "@phosphor-icons/react/ssr";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";
import { PasswordStrength } from "@/components/auth/password-strength";
import { resetPasswordAction } from "@/actions/auth";
import { resetPasswordSchema, type ResetPasswordInput } from "@/lib/validation/auth";

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  const password = useWatch({ control, name: "password" });

  async function onSubmit(values: ResetPasswordInput) {
    setFormError(null);
    const result = await resetPasswordAction({ ...values, token });
    if (result.ok) {
      router.replace("/login?notice=reset");
      return;
    }
    for (const [field, message] of Object.entries(result.fieldErrors ?? {})) {
      setError(field as keyof ResetPasswordInput, { message });
    }
    if (result.error) setFormError(result.error);
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <FieldGroup>
        <Field data-invalid={!!errors.password}>
          <FieldLabel htmlFor="password">New password</FieldLabel>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            autoFocus
            aria-invalid={!!errors.password}
            {...register("password")}
          />
          <PasswordStrength password={password} />
          <FieldError errors={[errors.password]} />
        </Field>
        <Field data-invalid={!!errors.confirmPassword}>
          <FieldLabel htmlFor="confirmPassword">Confirm new password</FieldLabel>
          <Input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            aria-invalid={!!errors.confirmPassword}
            {...register("confirmPassword")}
          />
          <FieldError errors={[errors.confirmPassword]} />
        </Field>
        {formError && (
          <div role="alert" className="space-y-1 text-sm font-medium text-destructive">
            <p>{formError}</p>
            <Link href="/forgot-password" className="text-primary hover:underline">
              Request a new link
            </Link>
          </div>
        )}
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="size-4 animate-spin" />}
          Reset password
        </Button>
      </FieldGroup>
    </form>
  );
}
