"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CircleNotch as Loader2, EnvelopeSimple } from "@phosphor-icons/react/ssr";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";
import { NativeSelect } from "@/components/ux/native-select";
import { Captcha, captchaEnabled } from "@/components/auth/captcha";
import { PasswordStrength } from "@/components/auth/password-strength";
import { resendVerificationAction } from "@/actions/auth";
import { studentRegisterAction } from "@/actions/student-auth";
import { NO_PROGRAM_OPTION, studentRegisterSchema, type StudentRegisterInput } from "@/lib/validation/auth";

interface SectionOption {
  id: string;
  name: string;
  programId: string;
  stageKey: string;
  stageLabel: string;
}

export function StudentRegisterForm({ programs, sections }: { programs: { value: string; label: string }[]; sections: SectionOption[] }) {
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
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<StudentRegisterInput>({
    resolver: zodResolver(studentRegisterSchema),
    defaultValues: { studentNumber: "", name: "", email: "", programId: "", yearLevel: "", sectionId: "", password: "", confirmPassword: "", acceptTerms: false },
  });

  const [password, programId, yearLevel] = useWatch({ control, name: ["password", "programId", "yearLevel"] });

  // Program, then year level, then section: each list only offers what exists for the choices above.
  const programSections = useMemo(
    () => sections.filter((s) => s.programId === (programId === NO_PROGRAM_OPTION ? "" : programId)),
    [sections, programId]
  );
  const years = useMemo(
    () => [...new Map(programSections.map((s) => [s.stageKey, { value: s.stageKey, label: s.stageLabel }])).values()],
    [programSections]
  );
  const sectionOptions = programSections.filter((s) => s.stageKey === yearLevel).map((s) => ({ value: s.id, label: s.name }));
  const programOptions = [
    ...programs.filter((p) => sections.some((s) => s.programId === p.value)),
    ...(sections.some((s) => !s.programId) ? [{ value: NO_PROGRAM_OPTION, label: "Elementary or Junior High School (no program or strand)" }] : []),
  ];

  async function onSubmit(values: StudentRegisterInput) {
    setFormError(null);
    if (captchaEnabled && !captchaToken) {
      setFormError("Please complete the CAPTCHA check.");
      return;
    }
    const result = await studentRegisterAction({ ...values, captchaToken: captchaToken ?? undefined });
    setCaptchaReset((n) => n + 1);
    if (result.ok) {
      setRegisteredEmail(values.email);
      return;
    }
    for (const [field, message] of Object.entries(result.fieldErrors ?? {})) setError(field as keyof StudentRegisterInput, { message });
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
              We sent a verification link to <span className="font-medium text-foreground">{registeredEmail}</span>. The link expires in 24 hours.
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
          <Link href="/student/login" className="font-medium text-primary hover:underline">
            Back to student sign in
          </Link>
        </p>
      </div>
    );
  }

  const text = (name: "studentNumber" | "name" | "email", label: string, props: React.ComponentProps<typeof Input> = {}) => (
    <Field data-invalid={!!errors[name]}>
      <FieldLabel htmlFor={name}>{label}</FieldLabel>
      <Input id={name} aria-invalid={!!errors[name]} {...props} {...register(name)} />
      <FieldError errors={[errors[name]]} />
    </Field>
  );

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <FieldGroup>
        {text("studentNumber", "Student number or Learner Reference Number", { placeholder: "136512090001", autoComplete: "off" })}
        {text("name", "Full name", { placeholder: "Juan Dela Cruz", autoComplete: "name" })}
        {text("email", "Email", { type: "email", placeholder: "you@granby.edu.ph", autoComplete: "email" })}

        <Field data-invalid={!!errors.programId}>
          <FieldLabel htmlFor="programId">Program or strand</FieldLabel>
          <NativeSelect
            id="programId"
            placeholder="Choose your program or strand"
            options={programOptions}
            aria-invalid={!!errors.programId}
            {...register("programId", {
              onChange: () => {
                setValue("yearLevel", "");
                setValue("sectionId", "");
              },
            })}
          />
          <FieldError errors={[errors.programId]} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={!!errors.yearLevel}>
            <FieldLabel htmlFor="yearLevel">Year level</FieldLabel>
            <NativeSelect
              id="yearLevel"
              placeholder="Choose"
              options={years}
              disabled={!programId}
              aria-invalid={!!errors.yearLevel}
              {...register("yearLevel", { onChange: () => setValue("sectionId", "") })}
            />
            <FieldError errors={[errors.yearLevel]} />
          </Field>
          <Field data-invalid={!!errors.sectionId}>
            <FieldLabel htmlFor="sectionId">Section</FieldLabel>
            <NativeSelect id="sectionId" placeholder="Choose" options={sectionOptions} disabled={!yearLevel} aria-invalid={!!errors.sectionId} {...register("sectionId")} />
            <FieldError errors={[errors.sectionId]} />
          </Field>
        </div>
        <FieldDescription>Only sections of the current term are listed.</FieldDescription>

        <Field data-invalid={!!errors.password}>
          <FieldLabel htmlFor="password">Password</FieldLabel>
          <Input id="password" type="password" autoComplete="new-password" aria-invalid={!!errors.password} {...register("password")} />
          <PasswordStrength password={password} />
          <FieldError errors={[errors.password]} />
        </Field>
        <Field data-invalid={!!errors.confirmPassword}>
          <FieldLabel htmlFor="confirmPassword">Confirm password</FieldLabel>
          <Input id="confirmPassword" type="password" autoComplete="new-password" aria-invalid={!!errors.confirmPassword} {...register("confirmPassword")} />
          <FieldError errors={[errors.confirmPassword]} />
        </Field>
        <Field data-invalid={!!errors.acceptTerms}>
          <label className="flex items-start gap-2 text-sm">
            <Controller
              control={control}
              name="acceptTerms"
              render={({ field }) => (
                <Checkbox className="mt-0.5" checked={field.value} onCheckedChange={(v) => field.onChange(!!v)} aria-invalid={!!errors.acceptTerms} />
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
          Create student account
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          Already registered?{" "}
          <Link href="/student/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </FieldGroup>
    </form>
  );
}
