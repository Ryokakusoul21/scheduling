import "server-only";
import type { MailMessage } from "./mailer";

const BRAND = "#0b3d91";

function escape(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function layout(title: string, bodyHtml: string) {
  return `<!doctype html>
<html><body style="margin:0;background:#f4f5f7;font-family:Segoe UI,Arial,sans-serif;color:#1f2937">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:10px;overflow:hidden;border:1px solid #e5e7eb">
        <tr><td style="background:${BRAND};color:#ffffff;padding:18px 24px;font-size:15px;font-weight:600;letter-spacing:.3px">
          GRANBY COLLEGES OF SCIENCE & TECHNOLOGY Scheduling System
        </td></tr>
        <tr><td style="padding:24px">
          <h1 style="margin:0 0 12px;font-size:20px">${escape(title)}</h1>
          ${bodyHtml}
        </td></tr>
        <tr><td style="padding:14px 24px;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280">
          GRANBY COLLEGES OF SCIENCE &amp; TECHNOLOGY · Naic, Cavite<br/>
          This is an automated message. Please do not reply.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function button(href: string, label: string) {
  return `<p style="margin:20px 0"><a href="${escape(href)}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:600">${escape(label)}</a></p>
<p style="font-size:12px;color:#6b7280;word-break:break-all">Or paste this link into your browser:<br/>${escape(href)}</p>`;
}

const p = (text: string) => `<p style="margin:0 0 12px;line-height:1.5">${text}</p>`;

export function verificationEmail(to: string, name: string, link: string, ttlHours: number): MailMessage {
  return {
    to,
    subject: "Verify your email address",
    html: layout(
      "Verify your email",
      p(`Hi ${escape(name)},`) +
        p("Thanks for registering. Please confirm your email address to activate your account.") +
        button(link, "Verify email") +
        p(`This link expires in ${ttlHours} hours. If you didn't create an account, you can ignore this email.`),
    ),
    text: `Hi ${name},\n\nConfirm your email address to activate your account:\n${link}\n\nThis link expires in ${ttlHours} hours.`,
  };
}

export function passwordResetEmail(to: string, name: string, link: string, ttlMinutes: number): MailMessage {
  return {
    to,
    subject: "Reset your password",
    html: layout(
      "Reset your password",
      p(`Hi ${escape(name)},`) +
        p("We received a request to reset the password for your account.") +
        button(link, "Reset password") +
        p(`This link can be used once and expires in ${ttlMinutes} minutes.`) +
        p("If you didn't request this, you can safely ignore this email — your password won't change."),
    ),
    text: `Hi ${name},\n\nReset your password using this link (valid for ${ttlMinutes} minutes, single use):\n${link}\n\nIf you didn't request this, ignore this email.`,
  };
}

export function passwordChangedEmail(to: string, name: string, when: Date): MailMessage {
  const ts = when.toLocaleString("en-PH", { timeZone: "Asia/Manila" });
  return {
    to,
    subject: "Your password was changed",
    html: layout(
      "Password changed",
      p(`Hi ${escape(name)},`) +
        p(`The password for your account was changed on <strong>${escape(ts)}</strong>. All other sessions have been signed out.`) +
        p("If this wasn't you, reset your password immediately and contact the system administrator."),
    ),
    text: `Hi ${name},\n\nThe password for your account was changed on ${ts}. All other sessions have been signed out.\nIf this wasn't you, reset your password immediately and contact the administrator.`,
  };
}

export function accountApprovedEmail(to: string, name: string, link: string): MailMessage {
  return {
    to,
    subject: "Your account has been approved",
    html: layout(
      "Account approved",
      p(`Hi ${escape(name)},`) + p("An administrator has approved your account. You can now sign in.") + button(link, "Sign in"),
    ),
    text: `Hi ${name},\n\nAn administrator has approved your account. Sign in at:\n${link}`,
  };
}
