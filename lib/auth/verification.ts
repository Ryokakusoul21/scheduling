import "server-only";
import { AUTH } from "./config";
import { issueToken } from "./tokens";
import { appUrl, sendMail } from "@/lib/email/mailer";
import { verificationEmail } from "@/lib/email/templates";

/** Emails a single-use verification link; kept out of server action files so clients cannot call it. */
export async function sendVerification(user: { id: string; email: string; name: string }) {
  const token = await issueToken(user.id, "EMAIL_VERIFICATION", AUTH.emailVerificationTtlMinutes);
  const link = appUrl(`/verify-email?token=${token}`);
  await sendMail(verificationEmail(user.email, user.name, link, AUTH.emailVerificationTtlMinutes / 60));
}
