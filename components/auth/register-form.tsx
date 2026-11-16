"use client";

import { useState } from "react";
import Link from "next/link";
import { Controller, useForm, useWatch, type FieldPath } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, ArrowRight, Check, CircleNotch, EnvelopeSimple, WarningCircle } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";
import { NativeSelect } from "@/components/ux/native-select";
import { Captcha, captchaEnabled } from "@/components/auth/captcha";
import { PasswordStrength } from "@/components/auth/password-strength";
import { PasswordInput } from "@/components/auth/password-input";
import { registerAction, resendVerificationAction } from "@/actions/auth";
import { registerSchema, type RegisterInput } from "@/lib/validation/auth";

const EMPLOYEE_FIELDS: FieldPath<RegisterInput>[] = ["name", "suffix", "sex", "email", "employeeId", "employmentType", "departmentId"];
const LINK_CLASS = "rounded-sm font-medium text-brand-link underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring";

type Department = { id: string; code: string; name: string };

export function RegisterForm({ requiresApproval, departments }: { requiresApproval: boolean; departments: Department[] }) {
  const [step, setStep] = useState<1 | 2>(1);
  const [formError, setFormError] = useState<string | null>(null);
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaReset, setCaptchaReset] = useState(0);
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent">("idle");
  const { register, handleSubmit, control, setError, trigger, setFocus, getValues, formState: { errors, isSubmitting } } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: "", suffix: "", sex: undefined, employeeId: "", email: "", departmentId: "", employmentType: "FULL_TIME", password: "", confirmPassword: "", acceptTerms: false },
  });
  const password = useWatch({ control, name: "password" });

  async function continueToSecurity() {
    if (await trigger(EMPLOYEE_FIELDS, { shouldFocus: true })) {
      setFormError(null);
      setStep(2);
      // Both steps stay mounted, so values and refs survive navigation.
      requestAnimationFrame(() => setFocus("password"));
    }
  }

  async function onSubmit(values: RegisterInput) {
    setFormError(null);
    if (captchaEnabled && !captchaToken) {
      setFormError("Please complete the CAPTCHA check.");
      return;
    }
    try {
      const result = await registerAction({ ...values, captchaToken: captchaToken ?? undefined });
      setCaptchaReset((n) => n + 1);
      setCaptchaToken(null);
      if (result.ok) {
        setRegisteredEmail(values.email.trim().toLowerCase());
        return;
      }
      for (const [field, message] of Object.entries(result.fieldErrors ?? {})) setError(field as FieldPath<RegisterInput>, { message });
      const employeeError = EMPLOYEE_FIELDS.find((field) => result.fieldErrors?.[field]);
      if (employeeError) { setStep(1); requestAnimationFrame(() => setFocus(employeeError)); }
      if (result.error) setFormError(result.error);
    } catch {
      setFormError("We couldn’t create your account. Please try again in a moment.");
      setCaptchaReset((n) => n + 1);
      setCaptchaToken(null);
    }
  }

  if (registeredEmail) {
    return (
      <div className="space-y-5 text-sm">
        <div role="status" className="rounded-xl border border-brand-blue/20 bg-brand-blue/5 p-5">
          <EnvelopeSimple aria-hidden className="mb-3 size-8 text-brand-link" />
          <h2 className="text-lg font-semibold">Your next step: verify your email</h2>
          <p className="mt-2 break-all font-medium">{registeredEmail}</p>
          {requiresApproval && <p className="mt-3 text-xs text-muted-foreground">Administrator approval required after verification.</p>}
        </div>
        <Button type="button" variant="outline" className="min-h-11 w-full" disabled={resendState !== "idle"} onClick={async () => {
          setResendState("sending");
          setFormError(null);
          try {
            const result = await resendVerificationAction(registeredEmail);
            if (result.ok) setResendState("sent");
            else { setFormError(result.error ?? "Please try again."); setResendState("idle"); }
          } catch { setFormError("We couldn’t resend the email. Please try again."); setResendState("idle"); }
        }}>
          {resendState === "sending" && <CircleNotch aria-hidden className="size-4 animate-spin" />}
          {resendState === "sent" ? "Verification email requested" : resendState === "sending" ? "Requesting email…" : "Resend verification email"}
        </Button>
        {formError && <p role="alert" className="text-destructive">{formError}</p>}
        <p className="text-center"><Link href="/login" className={LINK_CLASS}>Back to sign in</Link></p>
      </div>
    );
  }

  return (
    <form noValidate aria-busy={isSubmitting} onSubmit={(event) => {
      if (step === 1) { event.preventDefault(); void continueToSecurity(); }
      else void handleSubmit(onSubmit, (invalid) => {
        const first = EMPLOYEE_FIELDS.find((field) => invalid[field]);
        if (first) { setStep(1); requestAnimationFrame(() => setFocus(first)); }
      })(event);
    }}>
      <ol aria-label="Registration progress" className="mb-7 grid grid-cols-2 gap-3 border-b pb-5">
        {["Employee details", "Account security"].map((label, index) => (
          <li key={label} aria-current={step === index + 1 ? "step" : undefined} className={`flex items-center gap-2 text-xs font-medium ${step >= index + 1 ? "text-brand-link" : "text-muted-foreground"}`}>
            <span className={`flex size-7 shrink-0 items-center justify-center rounded-full ${step >= index + 1 ? "bg-brand-blue text-white" : "bg-muted"}`}>
              {index === 0 && step === 2 ? <Check aria-hidden className="size-4" weight="bold" /> : index + 1}
            </span>{label}
          </li>
        ))}
      </ol>
      <fieldset disabled={isSubmitting} className="min-w-0 space-y-6">
        <legend className="sr-only">{step === 1 ? "Employee details" : "Account security"}</legend>
        <div hidden={step !== 1}>
          <FieldGroup className="gap-5">
            <div className="grid gap-5 sm:grid-cols-[1fr_7rem]">
              <Field data-invalid={!!errors.name}>
                <FieldLabel htmlFor="name">Full name</FieldLabel>
                <Input id="name" autoComplete="name" placeholder="Juan Dela Cruz" aria-invalid={!!errors.name} aria-describedby={errors.name ? "name-error" : undefined} {...register("name")} />
                <FieldError id="name-error" errors={[errors.name]} />
              </Field>
              <Field data-invalid={!!errors.suffix}>
                <FieldLabel htmlFor="suffix">Suffix</FieldLabel>
                <Input id="suffix" autoComplete="honorific-suffix" placeholder="Jr." maxLength={10} aria-invalid={!!errors.suffix} aria-describedby="suffix-error" {...register("suffix")} />
                <FieldError id="suffix-error" errors={[errors.suffix]} />
              </Field>
            </div>
            <Field data-invalid={!!errors.sex}>
              <FieldLabel htmlFor="sex">Sex / Gender</FieldLabel>
              <NativeSelect id="sex" placeholder="Select" options={[{ value: "MALE", label: "Male" }, { value: "FEMALE", label: "Female" }]} aria-invalid={!!errors.sex} aria-describedby="sex-error" {...register("sex")} />
              <FieldError id="sex-error" errors={[errors.sex]} />
            </Field>
            <Field data-invalid={!!errors.email}>
              <FieldLabel htmlFor="email">Email address</FieldLabel>
              <Input id="email" type="email" autoComplete="email" placeholder="you@example.com" aria-invalid={!!errors.email} aria-describedby="email-error" {...register("email")} />
              <FieldError id="email-error" errors={[errors.email]} />
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field data-invalid={!!errors.employeeId}>
                <FieldLabel htmlFor="employeeId">Employee ID</FieldLabel>
                <Input id="employeeId" autoCapitalize="characters" spellCheck={false} placeholder="GC-001" maxLength={40} aria-invalid={!!errors.employeeId} aria-describedby="employee-error" {...register("employeeId")} />
                  <FieldError id="employee-error" errors={[errors.employeeId]} />
              </Field>
              <Field data-invalid={!!errors.employmentType}>
                <FieldLabel htmlFor="employmentType">Employment type</FieldLabel>
                <NativeSelect id="employmentType" options={[{ value: "FULL_TIME", label: "Full-time" }, { value: "PART_TIME", label: "Part-time" }]} aria-invalid={!!errors.employmentType} aria-describedby="employment-error" {...register("employmentType")} />
                <FieldError id="employment-error" errors={[errors.employmentType]} />
              </Field>
            </div>
            <Field data-invalid={!!errors.departmentId}>
              <FieldLabel htmlFor="departmentId">Department</FieldLabel>
              <NativeSelect id="departmentId" placeholder="Select a department" options={departments.map((d) => ({ value: d.id, label: `${d.name} (${d.code})` }))} aria-invalid={!!errors.departmentId} aria-describedby="department-help department-error" disabled={!departments.length} {...register("departmentId")} />
              <p id="department-help" className="text-xs leading-5 text-muted-foreground">{departments.length ? "" : "No departments available. Contact the school administrator."}</p>
              <FieldError id="department-error" errors={[errors.departmentId]} />
            </Field>
            <Button type="submit" className="w-full" disabled={!departments.length}>Continue <ArrowRight aria-hidden className="size-4" /></Button>
          </FieldGroup>
        </div>
        <div hidden={step !== 2}>
          <FieldGroup className="gap-5">
            <div className="rounded-lg border bg-muted/40 p-3 text-sm">
              <p className="font-medium break-words">{getValues("name")}</p>
              <p className="mt-1 break-all text-xs text-muted-foreground">{getValues("email")}</p>
              <p className="mt-1 text-xs text-muted-foreground">{departments.find((d) => d.id === getValues("departmentId"))?.name}</p>
            </div>
            <Field data-invalid={!!errors.password}>
              <FieldLabel htmlFor="password">Create password</FieldLabel>
              <PasswordInput id="password" autoComplete="new-password" placeholder="Choose a strong password" aria-invalid={!!errors.password} aria-describedby="password-help password-error" {...register("password")} />
              <p id="password-help" className="text-xs leading-5 text-muted-foreground">8+ characters with upper, lower, number, and symbol.</p>
              <PasswordStrength password={password} />
              <FieldError id="password-error" errors={[errors.password]} />
            </Field>
            <Field data-invalid={!!errors.confirmPassword}>
              <FieldLabel htmlFor="confirmPassword">Confirm password</FieldLabel>
              <PasswordInput id="confirmPassword" autoComplete="new-password" placeholder="Re-enter your password" aria-invalid={!!errors.confirmPassword} aria-describedby="confirm-error" {...register("confirmPassword")} />
              <FieldError id="confirm-error" errors={[errors.confirmPassword]} />
            </Field>
            <Field data-invalid={!!errors.acceptTerms}>
              <label className="flex cursor-pointer items-start gap-2.5 text-sm leading-6">
                <Controller control={control} name="acceptTerms" render={({ field }) => <Checkbox className="mt-1 shrink-0" checked={field.value} onCheckedChange={(value) => field.onChange(!!value)} aria-invalid={!!errors.acceptTerms} aria-describedby="terms-error" />} />
                <span>I agree to the <Link href="/terms" target="_blank" className={LINK_CLASS}>Terms of Service</Link> and <Link href="/privacy" target="_blank" className={LINK_CLASS}>Privacy Policy</Link>.</span>
              </label>
              <FieldError id="terms-error" errors={[errors.acceptTerms]} />
            </Field>
            {step === 2 && <Captcha onToken={setCaptchaToken} resetKey={captchaReset} />}
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? <CircleNotch aria-hidden className="size-4 animate-spin" /> : <ArrowRight aria-hidden className="size-4" />}
              {isSubmitting ? "Creating your account…" : "Create account"}
            </Button>
            <Button type="button" variant="ghost" className="w-full" onClick={() => { setStep(1); requestAnimationFrame(() => setFocus("name")); }}><ArrowLeft aria-hidden className="size-4" /> Back</Button>
          </FieldGroup>
        </div>
      </fieldset>
      {formError && <div role="alert" className="mt-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"><WarningCircle aria-hidden className="mt-0.5 size-4 shrink-0" />{formError}</div>}
      <p className="mt-6 border-t pt-5 text-center text-sm text-muted-foreground">Already have an account? <Link href="/login" className={LINK_CLASS}>Sign in</Link></p>
    </form>
  );
}
