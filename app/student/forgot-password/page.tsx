import { AuthShell } from "@/components/auth/auth-shell";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export const metadata = { title: "Student Forgot Password · GRANBY COLLEGES OF SCIENCE AND TECHNOLOGY" };

export default function StudentForgotPasswordPage() {
  return (
    <AuthShell title="Reset password" description="We will email you a reset link.">
      <ForgotPasswordForm audience="student" />
    </AuthShell>
  );
}
