import "server-only";
import nodemailer, { type Transporter } from "nodemailer";

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

let transporter: Transporter | null | undefined;

function getTransporter() {
  if (transporter !== undefined) return transporter;
  const host = process.env.SMTP_HOST;
  if (!host) {
    transporter = null;
    return transporter;
  }
  const port = Number(process.env.SMTP_PORT ?? 587);
  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
      : undefined,
  });
  return transporter;
}

export function appUrl(path = "") {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${base}${path}`;
}

/**
 * Sends an email via SMTP. When SMTP isn't configured (local dev), the message
 * is printed to the server console instead so links can still be followed.
 * Never throws — auth flows must not leak whether delivery failed.
 */
export async function sendMail(message: MailMessage) {
  const t = getTransporter();
  if (!t) {
    console.info(
      `\n[mail:dev] To: ${message.to}\n[mail:dev] Subject: ${message.subject}\n${message.text}\n`,
    );
    return;
  }
  try {
    await t.sendMail({
      from: process.env.EMAIL_FROM ?? "GRANBY COLLEGES OF SCIENCE & TECHNOLOGY <no-reply@granby.edu.ph>",
      ...message,
    });
  } catch (err) {
    console.error("[mail] Failed to send email:", err);
  }
}
