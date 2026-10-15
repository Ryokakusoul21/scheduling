import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().min(1, "Email is required").email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
  remember: z.boolean().optional(),
  code: z.string().optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;

/** Password strength policy shared by registration, reset, and change password. */
export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password must be at most 128 characters")
  .regex(/[a-z]/, "Include at least one lowercase letter")
  .regex(/[A-Z]/, "Include at least one uppercase letter")
  .regex(/\d/, "Include at least one number")
  .regex(/[^A-Za-z0-9]/, "Include at least one symbol");

/** 0–4 score for the strength meter. */
export function passwordScore(pw: string) {
  if (!pw) return 0;
  const checks = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  let score = pw.length >= 8 ? checks : Math.min(checks, 1);
  if (pw.length >= 12 && score >= 3) score = Math.min(4, score + 1);
  return Math.min(score, 4);
}

export const registerSchema = z
  .object({
    name: z.string().trim().min(2, "Enter your full name").max(100),
    email: z.string().trim().toLowerCase().min(1, "Email is required").email("Enter a valid email address"),
    password: passwordSchema,
    confirmPassword: z.string().min(1, "Confirm your password"),
    acceptTerms: z.boolean().refine((v) => v, "You must accept the Terms and Privacy Policy"),
  })
  .refine((d) => d.password === d.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });

export type RegisterInput = z.infer<typeof registerSchema>;

/** Registration choice for learners whose section has no program or strand. */
export const NO_PROGRAM_OPTION = "NONE";

export const studentRegisterSchema = z
  .object({
    studentNumber: z
      .string()
      .trim()
      .min(4, "Enter your student number or Learner Reference Number")
      .max(20)
      .regex(/^[A-Za-z0-9-]+$/, "Use letters, numbers, and dashes only"),
    name: z.string().trim().min(2, "Enter your full name").max(100),
    email: z.string().trim().toLowerCase().min(1, "Email is required").email("Enter a valid email address"),
    /** NO_PROGRAM_OPTION for Elementary and Junior High sections. */
    programId: z.string().min(1, "Choose your program or strand"),
    yearLevel: z.string().min(1, "Choose your year or grade level"),
    sectionId: z.string().min(1, "Choose your section"),
    password: passwordSchema,
    confirmPassword: z.string().min(1, "Confirm your password"),
    acceptTerms: z.boolean().refine((v) => v, "You must accept the Terms and Privacy Policy"),
  })
  .refine((d) => d.password === d.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });

export type StudentRegisterInput = z.infer<typeof studentRegisterSchema>;

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().min(1, "Email is required").email("Enter a valid email address"),
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string().min(1, "Confirm your password"),
  })
  .refine((d) => d.password === d.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password"),
    password: passwordSchema,
    confirmPassword: z.string().min(1, "Confirm your password"),
  })
  .refine((d) => d.password === d.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
