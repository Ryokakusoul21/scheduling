import { AuthShell } from "@/components/auth/auth-shell";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export const metadata = { title: "Student Forgot Password · GRANBY COLLEGES OF SCIENCE & TECHNOLOGY" };

export default function StudentForgotPasswordPage() {
  return (
    <AuthShell title="Forgot your password?" description="Enter the email of your student account and we'll send you a reset link.">
      <ForgotPasswordForm audience="student" />
    </AuthShell>
  );
}
