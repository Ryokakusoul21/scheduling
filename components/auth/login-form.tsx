"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { signIn } from "next-auth/react";
import { CircleNotch as Loader2, ShieldCheck } from "@phosphor-icons/react/ssr";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";
import { Captcha, captchaEnabled } from "@/components/auth/captcha";
import { resendVerificationAction } from "@/actions/auth";
import { loginSchema, type LoginInput } from "@/lib/validation/auth";
import type { LoginErrorCode } from "@/lib/auth/errors";

const DEMO_ACCOUNTS = [
  { label: "Administrator", email: "administrator@granby.edu.ph" },
  { label: "Head of Department", email: "head.computing@granby.edu.ph" },
  { label: "Faculty (overloaded)", email: "faculty@granby.edu.ph" },
  { label: "Faculty (underloaded)", email: "alonzo@granby.edu.ph" },
];

const ERROR_MESSAGES: Record<LoginErrorCode, string> = {
  invalid: "Invalid email or password.",
  locked: "Too many failed attempts. Your account is temporarily locked — try again in 15 minutes or reset your password.",
  rate_limited: "Too many sign-in attempts from your network. Please wait a few minutes and try again.",
  unverified: "Please verify your email address before signing in.",
  pending: "Your account is awaiting administrator approval.",
  inactive: "This account is inactive or suspended. Contact the system administrator.",
  two_factor_required: "",
  two_factor_invalid: "That verification code is incorrect or expired.",
  captcha: "Please complete the CAPTCHA check.",
};

/** Only allow same-origin relative redirects to avoid open-redirects. */
function safeCallback(url: string | undefined) {
  if (!url) return "/";
  try {
    const parsed = new URL(url, window.location.origin);
    if (parsed.origin !== window.location.origin) return "/";
    if (parsed.pathname.startsWith("/login")) return "/";
    return parsed.pathname + parsed.search + parsed.hash;
  } catch {
    return "/";
  }
}

export function LoginForm({ callbackUrl }: { callbackUrl?: string }) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<LoginErrorCode | null>(null);
  const [needsCode, setNeedsCode] = useState(false);
  const [remember, setRemember] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaReset, setCaptchaReset] = useState(0);
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent">("idle");

  const {
    register,
    handleSubmit,
    setValue,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "", code: "" },
  });

  async function onSubmit(values: LoginInput) {
    setFormError(null);
    setErrorCode(null);
    if (captchaEnabled && !captchaToken) {
      setFormError(ERROR_MESSAGES.captcha);
      return;
    }

    const result = await signIn("credentials", {
      email: values.email,
      password: values.password,
      code: needsCode ? values.code ?? "" : "",
      remember: remember ? "true" : "false",
      captchaToken: captchaToken ?? "",
      redirect: false,
    });
    setCaptchaReset((n) => n + 1);

    if (result?.error) {
      const code = (result.code ?? "invalid") as LoginErrorCode;
      if (code === "two_factor_required") {
        setNeedsCode(true);
        return;
      }
      setErrorCode(code);
      setFormError(ERROR_MESSAGES[code] ?? ERROR_MESSAGES.invalid);
      if (code === "two_factor_invalid") setValue("code", "");
      return;
    }

    // "/" resolves to the role-appropriate landing page on the server.
    router.push(safeCallback(callbackUrl));
    router.refresh();
  }

  async function resend() {
    setResendState("sending");
    await resendVerificationAction(getValues("email"));
    setResendState("sent");
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <FieldGroup>
          <div className={needsCode ? "hidden" : "contents"}>
            <Field data-invalid={!!errors.email}>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@granby.edu.ph"
                aria-invalid={!!errors.email}
                {...register("email")}
              />
              <FieldError errors={[errors.email]} />
            </Field>
            <Field data-invalid={!!errors.password}>
              <div className="flex items-center justify-between">
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <Link href="/forgot-password" className="text-xs font-medium text-primary hover:underline">
                  Forgot password?
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                aria-invalid={!!errors.password}
                {...register("password")}
              />
              <FieldError errors={[errors.password]} />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={remember} onCheckedChange={(v) => setRemember(!!v)} />
              Remember me for 30 days
            </label>
          </div>

          {needsCode && (
            <Field>
              <div className="flex items-start gap-2 rounded-lg border bg-muted/40 p-3 text-sm">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
                <p>Two-factor authentication is on. Enter the 6-digit code from your authenticator app.</p>
              </div>
              <FieldLabel htmlFor="code">Verification code</FieldLabel>
              <Input
                id="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="123456"
                autoFocus
                {...register("code")}
              />
            </Field>
          )}

          <Captcha onToken={setCaptchaToken} resetKey={captchaReset} />

          {formError && (
            <div role="alert" className="space-y-2 text-sm font-medium text-destructive">
              <p>{formError}</p>
              {errorCode === "unverified" && (
                <Button type="button" variant="outline" size="sm" onClick={resend} disabled={resendState !== "idle"}>
                  {resendState === "sent" ? "Verification email sent" : "Resend verification email"}
                </Button>
              )}
            </div>
          )}

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="size-4 animate-spin" />}
            {needsCode ? "Verify and sign in" : "Sign In"}
          </Button>

          {needsCode ? (
            <button
              type="button"
              className="text-sm text-muted-foreground hover:underline"
              onClick={() => {
                setNeedsCode(false);
                setValue("code", "");
                setFormError(null);
              }}
            >
              Back to sign in
            </button>
          ) : (
            <p className="text-center text-sm text-muted-foreground">
              Don&apos;t have an account?{" "}
              <Link href="/register" className="font-medium text-primary hover:underline">
                Create one
              </Link>
            </p>
          )}
        </FieldGroup>
      </form>

      {!needsCode && (
        <div className="rounded-lg border bg-muted/40 p-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">Demo accounts (password: Passw0rd!)</p>
          <div className="flex flex-wrap gap-1.5">
            {DEMO_ACCOUNTS.map((a) => (
              <button
                key={a.email}
                type="button"
                onClick={() => {
                  setValue("email", a.email);
                  setValue("password", "Passw0rd!");
                }}
                className="rounded-full border bg-background px-2.5 py-1 text-xs font-medium hover:bg-accent"
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
