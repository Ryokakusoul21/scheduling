"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { signIn } from "next-auth/react";
import { CircleNotch as Loader2, Envelope, Eye, EyeSlash, Lock, ShieldCheck, Warning, WarningCircle, X } from "@phosphor-icons/react/ssr";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";
import { Captcha, captchaEnabled } from "@/components/auth/captcha";
import { resendVerificationAction, type Audience } from "@/actions/auth";
import { DEMO_STAFF, DEMO_STUDENTS } from "@/lib/auth/demo-accounts";
import { loginSchema, type LoginInput } from "@/lib/validation/auth";
import type { LoginErrorCode } from "@/lib/auth/errors";

// Demo shortcuts are a development aid only and never ship to production.
const SHOW_DEMO = process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_SHOW_DEMO === "true";
const DEMO_PASSWORD = "Passw0rd!";

const DEMO_ACCOUNTS: Record<Audience, { label: string; email: string }[]> = { staff: DEMO_STAFF, student: DEMO_STUDENTS };

const ERROR_MESSAGES: Record<LoginErrorCode, string> = {
  invalid: "Incorrect email or password.",
  locked: "Too many failed attempts. Your account is temporarily locked — try again in 15 minutes or reset your password.",
  rate_limited: "Too many sign-in attempts from your network. Please wait a few minutes and try again.",
  unverified: "Please verify your email address before signing in.",
  pending: "Your account is awaiting administrator approval.",
  inactive: "This account is inactive or suspended. Contact the system administrator.",
  two_factor_required: "",
  two_factor_invalid: "That verification code is incorrect or expired.",
  captcha: "Please complete the CAPTCHA check.",
};

// Taller inputs with a leading icon and a brand-blue focus ring.
const INPUT_CLASS =
  "h-12 rounded-xl bg-card pl-11 text-base shadow-xs transition-[border-color,box-shadow] duration-150 focus-visible:border-brand-blue focus-visible:ring-3 focus-visible:ring-brand-blue/25 md:text-sm dark:bg-input/30";
const ICON_CLASS = "pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted-foreground";
const LINK_CLASS = "rounded-sm font-medium text-brand-link underline-offset-4 hover:underline";

/** Only allow same-origin relative redirects to avoid open-redirects. */
function safeCallback(url: string | undefined, fallback = "/") {
  if (!url) return fallback;
  try {
    const parsed = new URL(url, window.location.origin);
    if (parsed.origin !== window.location.origin) return fallback;
    if (parsed.pathname.startsWith("/login") || parsed.pathname.startsWith("/student/login")) return fallback;
    return parsed.pathname + parsed.search + parsed.hash;
  } catch {
    return fallback;
  }
}

export function LoginForm({ callbackUrl, audience = "staff" }: { callbackUrl?: string; audience?: Audience }) {
  // Student pages live under /student; staff pages keep their original addresses.
  const base = audience === "student" ? "/student" : "";
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<LoginErrorCode | null>(null);
  const [needsCode, setNeedsCode] = useState(false);
  const [remember, setRemember] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaReset, setCaptchaReset] = useState(0);
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent">("idle");
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);

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
      portal: audience,
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
    router.push(safeCallback(callbackUrl, audience === "student" ? "/student" : "/"));
    router.refresh();
  }

  function detectCapsLock(e: React.KeyboardEvent<HTMLInputElement>) {
    setCapsLock(e.getModifierState("CapsLock"));
  }

  async function resend() {
    setResendState("sending");
    await resendVerificationAction(getValues("email"));
    setResendState("sent");
  }

  const passwordField = register("password");
  const passwordHints = [errors.password && "password-error", capsLock && "password-caps"].filter(Boolean).join(" ");

  return (
    <div className="space-y-8">
      <form onSubmit={handleSubmit(onSubmit)} noValidate aria-busy={isSubmitting}>
        <FieldGroup className="gap-6">
          <div aria-live="polite" className="empty:hidden">
            {formError && (
              <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                <WarningCircle className="mt-0.5 size-5 shrink-0" weight="fill" />
                <div className="flex-1 space-y-2">
                  <p className="font-medium">{formError}</p>
                  {errorCode === "unverified" && (
                    <Button type="button" variant="outline" size="sm" onClick={resend} disabled={resendState !== "idle"}>
                      {resendState === "sent" ? "Verification email sent" : "Resend verification email"}
                    </Button>
                  )}
                </div>
                <button
                  type="button"
                  aria-label="Dismiss message"
                  onClick={() => setFormError(null)}
                  className="-m-1 rounded-md p-1 transition-colors duration-150 hover:bg-destructive/10"
                >
                  <X className="size-4" />
                </button>
              </div>
            )}
          </div>

          <div className={needsCode ? "hidden" : "contents"}>
            <Field data-invalid={!!errors.email}>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <div className="relative">
                <Envelope className={ICON_CLASS} aria-hidden />
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  autoFocus
                  placeholder="you@granby.edu.ph"
                  aria-invalid={!!errors.email}
                  aria-describedby={errors.email ? "email-error" : undefined}
                  className={INPUT_CLASS}
                  {...register("email")}
                />
              </div>
              <FieldError id="email-error" errors={[errors.email]} />
            </Field>
            <Field data-invalid={!!errors.password}>
              <FieldLabel htmlFor="password">Password</FieldLabel>
              <div className="relative">
                <Lock className={ICON_CLASS} aria-hidden />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  aria-invalid={!!errors.password}
                  aria-describedby={passwordHints || undefined}
                  className={`${INPUT_CLASS} pr-12`}
                  {...passwordField}
                  onKeyDown={detectCapsLock}
                  onKeyUp={detectCapsLock}
                  onBlur={(e) => {
                    setCapsLock(false);
                    return passwordField.onBlur(e);
                  }}
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-controls="password"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute top-1/2 right-1.5 flex size-9 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
                >
                  {showPassword ? <EyeSlash className="size-5" /> : <Eye className="size-5" />}
                </button>
              </div>
              {capsLock && (
                <p id="password-caps" className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                  <Warning className="size-4" weight="fill" />
                  Caps Lock is on.
                </p>
              )}
              <FieldError id="password-error" errors={[errors.password]} />
            </Field>
            <div className="flex items-center justify-between gap-3">
              <label className="flex w-fit cursor-pointer items-center gap-2.5 text-sm select-none">
                <Checkbox checked={remember} onCheckedChange={(v) => setRemember(!!v)} className="size-[18px] rounded-[5px]" />
                Remember me for 30 days
              </label>
              <Link href={`${base}/forgot-password`} className={`text-sm ${LINK_CLASS}`}>
                Forgot password?
              </Link>
            </div>
          </div>

          {needsCode && (
            <Field>
              <div className="flex items-start gap-2 rounded-xl border bg-muted/40 p-3 text-sm">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
                <p>Two-factor authentication is on. Enter the 6-digit code from your authenticator app, or one of your recovery codes.</p>
              </div>
              <FieldLabel htmlFor="code">Verification code</FieldLabel>
              <Input
                id="code"
                autoComplete="one-time-code"
                maxLength={12}
                placeholder="123456"
                autoFocus
                className="h-12 rounded-xl bg-card text-base tracking-widest focus-visible:border-brand-blue focus-visible:ring-brand-blue/25 dark:bg-input/30"
                {...register("code")}
              />
            </Field>
          )}

          <Captcha onToken={setCaptchaToken} resetKey={captchaReset} />

          <Button
            type="submit"
            disabled={isSubmitting}
            className="h-12 w-full gap-2 rounded-xl bg-brand-blue text-base font-semibold text-white transition-colors duration-150 hover:bg-brand-blue/90 focus-visible:border-brand-blue focus-visible:ring-brand-blue/40 active:bg-brand-navy disabled:opacity-80"
          >
            {isSubmitting && <Loader2 className="size-5 animate-spin" />}
            {isSubmitting ? "Signing in…" : needsCode ? "Verify and sign in" : "Sign In"}
          </Button>

          {needsCode ? (
            <button
              type="button"
              className="mx-auto rounded-sm text-sm text-muted-foreground hover:text-foreground hover:underline"
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
              <Link href={`${base}/register`} className={LINK_CLASS}>
                Create one
              </Link>
            </p>
          )}
        </FieldGroup>
      </form>

      {SHOW_DEMO && !needsCode && (
        <details className="group rounded-xl border border-dashed p-3 text-sm">
          <summary className="flex cursor-pointer list-none items-center gap-2 rounded-sm text-xs font-medium text-muted-foreground [&::-webkit-details-marker]:hidden">
            <span className="rounded bg-brand-gold/20 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-amber-800 dark:text-brand-gold">DEV</span>
            Demo accounts
            <span className="ml-auto transition-transform duration-150 group-open:rotate-180" aria-hidden>
              &#9662;
            </span>
          </summary>
          <p className="mt-3 mb-2 text-xs text-muted-foreground">Click a role to autofill.</p>
          <div className="flex flex-wrap gap-1.5">
            {DEMO_ACCOUNTS[audience].map((a) => (
              <button
                key={a.email}
                type="button"
                onClick={() => {
                  setValue("email", a.email, { shouldValidate: !!errors.email });
                  setValue("password", DEMO_PASSWORD, { shouldValidate: !!errors.password });
                }}
                className="rounded-full border bg-background px-3 py-1.5 text-xs font-medium transition-colors duration-150 hover:bg-accent"
              >
                {a.label}
              </button>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
