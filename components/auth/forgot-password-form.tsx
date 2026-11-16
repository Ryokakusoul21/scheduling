"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, ArrowRight, CircleNotch as Loader2, EnvelopeSimple, Clock } from "@phosphor-icons/react/ssr";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";
import { Captcha, captchaEnabled } from "@/components/auth/captcha";
import { forgotPasswordAction, type Audience } from "@/actions/auth";
import { forgotPasswordSchema, type ForgotPasswordInput } from "@/lib/validation/auth";

export function ForgotPasswordForm({ audience = "staff" }: { audience?: Audience }) {
  const loginHref = audience === "student" ? "/student/login" : "/login";
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
    try {
      const result = await forgotPasswordAction({ ...values, captchaToken: captchaToken ?? undefined, audience });
      if (result.ok) setSentTo(values.email.trim().toLowerCase());
      else setFormError(result.error ?? result.fieldErrors?.email ?? "Something went wrong.");
    } catch {
      setFormError("We couldn’t request a reset link. Please try again in a moment.");
    } finally {
      setCaptchaReset((n) => n + 1);
      setCaptchaToken(null);
    }
  }

  if (sentTo) {
    return (
      <div className="space-y-5 text-sm">
        <div role="status" className="rounded-xl border border-brand-blue/20 bg-brand-blue/5 p-5">
          <EnvelopeSimple aria-hidden className="mb-3 size-8 text-brand-link" />
          <h2 className="text-lg font-semibold">Check your inbox</h2>
          <p className="mt-2 leading-6 text-muted-foreground">
            If an account exists for <span className="font-medium break-all text-foreground">{sentTo}</span>, we&apos;ve sent a
            link to reset your password.
          </p>
          <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground"><Clock aria-hidden className="size-4 shrink-0" /> The link expires in 30 minutes and can be used once.</p>
        </div>
        <Button type="button" variant="outline" className="min-h-11 w-full" onClick={() => { setSentTo(null); setFormError(null); }}>Try another email address</Button>
        <p className="text-center">
          <Link href={loginHref} className="inline-flex items-center gap-2 rounded-sm font-medium text-brand-link hover:underline">
            <ArrowLeft aria-hidden className="size-4" /> Back to sign in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate aria-busy={isSubmitting}>
      <FieldGroup className="gap-5">
        <Field data-invalid={!!errors.email}>
          <FieldLabel htmlFor="email">Email address</FieldLabel>
          <div className="relative">
            <EnvelopeSimple aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted-foreground" />
            <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            autoFocus
            className="pl-11"
            aria-invalid={!!errors.email}
            aria-describedby="email-error"
            {...register("email")}
            />
          </div>
          <FieldError id="email-error" errors={[errors.email]} />
        </Field>
        <Captcha onToken={setCaptchaToken} resetKey={captchaReset} />
        {formError && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {formError}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <ArrowRight aria-hidden className="size-4" />}
          {isSubmitting ? "Sending…" : "Send reset link"}
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          <Link href={loginHref} className="inline-flex items-center gap-2 rounded-sm font-medium text-brand-link hover:underline">
            <ArrowLeft aria-hidden className="size-4" /> Back to sign in
          </Link>
        </p>
      </FieldGroup>
    </form>
  );
}
