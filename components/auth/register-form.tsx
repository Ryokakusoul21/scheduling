"use client";

import { useState } from "react";
import Link from "next/link";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CircleNotch as Loader2, EnvelopeSimple } from "@phosphor-icons/react/ssr";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";
import { Captcha, captchaEnabled } from "@/components/auth/captcha";
import { PasswordStrength } from "@/components/auth/password-strength";
import { registerAction, resendVerificationAction } from "@/actions/auth";
import { registerSchema, type RegisterInput } from "@/lib/validation/auth";

export function RegisterForm({ requiresApproval }: { requiresApproval: boolean }) {
  const [formError, setFormError] = useState<string | null>(null);
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaReset, setCaptchaReset] = useState(0);
  const [resent, setResent] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: "", email: "", password: "", confirmPassword: "", acceptTerms: false },
  });

  const password = useWatch({ control, name: "password" });

  async function onSubmit(values: RegisterInput) {
    setFormError(null);
    if (captchaEnabled && !captchaToken) {
      setFormError("Please complete the CAPTCHA check.");
      return;
    }
    const result = await registerAction({ ...values, captchaToken: captchaToken ?? undefined });
    setCaptchaReset((n) => n + 1);
    if (result.ok) {
      setRegisteredEmail(values.email);
      return;
    }
    if (result.fieldErrors) {
      for (const [field, message] of Object.entries(result.fieldErrors)) {
        setError(field as keyof RegisterInput, { message });
      }
    }
    if (result.error) setFormError(result.error);
  }

  if (registeredEmail) {
    return (
      <div className="space-y-4 text-sm">
        <div className="flex items-start gap-3 rounded-lg border bg-muted/40 p-4">
          <EnvelopeSimple className="mt-0.5 size-5 shrink-0 text-primary" />
          <div className="space-y-1">
            <p className="font-medium">Check your inbox</p>
            <p className="text-muted-foreground">
              We sent a verification link to <span className="font-medium text-foreground">{registeredEmail}</span>.
              The link expires in 24 hours.
              {requiresApproval && " After verifying, an administrator will review and approve your account."}
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          className="w-full"
          disabled={resent}
          onClick={async () => {
            await resendVerificationAction(registeredEmail);
            setResent(true);
          }}
        >
          {resent ? "Verification email sent again" : "Resend verification email"}
        </Button>
        <p className="text-center text-muted-foreground">
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
        <Field data-invalid={!!errors.name}>
          <FieldLabel htmlFor="name">Full name</FieldLabel>
          <Input id="name" autoComplete="name" placeholder="Juan Dela Cruz" aria-invalid={!!errors.name} {...register("name")} />
          <FieldError errors={[errors.name]} />
        </Field>
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
        <Field data-invalid={!!errors.password}>
          <FieldLabel htmlFor="password">Password</FieldLabel>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            aria-invalid={!!errors.password}
            {...register("password")}
          />
          <PasswordStrength password={password} />
          <FieldError errors={[errors.password]} />
        </Field>
        <Field data-invalid={!!errors.confirmPassword}>
          <FieldLabel htmlFor="confirmPassword">Confirm password</FieldLabel>
          <Input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            aria-invalid={!!errors.confirmPassword}
            {...register("confirmPassword")}
          />
          <FieldError errors={[errors.confirmPassword]} />
        </Field>
        <Field data-invalid={!!errors.acceptTerms}>
          <label className="flex items-start gap-2 text-sm">
            <Controller
              control={control}
              name="acceptTerms"
              render={({ field }) => (
                <Checkbox
                  className="mt-0.5"
                  checked={field.value}
                  onCheckedChange={(v) => field.onChange(!!v)}
                  aria-invalid={!!errors.acceptTerms}
                />
              )}
            />
            <span>
              I agree to the{" "}
              <Link href="/terms" target="_blank" className="font-medium text-primary hover:underline">
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link href="/privacy" target="_blank" className="font-medium text-primary hover:underline">
                Privacy Policy
              </Link>
              .
            </span>
          </label>
          <FieldError errors={[errors.acceptTerms]} />
        </Field>

        <Captcha onToken={setCaptchaToken} resetKey={captchaReset} />

        {formError && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {formError}
          </p>
        )}

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="size-4 animate-spin" />}
          Create account
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </FieldGroup>
    </form>
  );
}
