"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CircleNotch as Loader2, EnvelopeSimple } from "@phosphor-icons/react/ssr";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";
import { Captcha, captchaEnabled } from "@/components/auth/captcha";
import { forgotPasswordAction } from "@/actions/auth";
import { forgotPasswordSchema, type ForgotPasswordInput } from "@/lib/validation/auth";

export function ForgotPasswordForm() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaReset, setCaptchaReset] = useState(0);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  async function onSubmit(values: ForgotPasswordInput) {
    setFormError(null);
    if (captchaEnabled && !captchaToken) {
      setFormError("Please complete the CAPTCHA check.");
      return;
    }
    const result = await forgotPasswordAction({ ...values, captchaToken: captchaToken ?? undefined });
    setCaptchaReset((n) => n + 1);
    if (result.ok) setSentTo(values.email);
    else setFormError(result.error ?? result.fieldErrors?.email ?? "Something went wrong.");
  }

  if (sentTo) {
    return (
      <div className="space-y-4 text-sm">
        <div className="flex items-start gap-3 rounded-lg border bg-muted/40 p-4">
          <EnvelopeSimple className="mt-0.5 size-5 shrink-0 text-primary" />
          <p className="text-muted-foreground">
            If an account exists for <span className="font-medium text-foreground">{sentTo}</span>, we&apos;ve sent a
            link to reset your password. The link expires in 30 minutes and can only be used once.
          </p>
        </div>
        <p className="text-center">
          <Link href="/login" className="font-medium text-primary hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <FieldGroup>
        <Field data-invalid={!!errors.email}>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@gcst.edu.ph"
            aria-invalid={!!errors.email}
            {...register("email")}
          />
          <FieldError errors={[errors.email]} />
        </Field>
        <Captcha onToken={setCaptchaToken} resetKey={captchaReset} />
        {formError && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {formError}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="size-4 animate-spin" />}
          Send reset link
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          Remembered it?{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Back to sign in
          </Link>
        </p>
      </FieldGroup>
    </form>
  );
}
