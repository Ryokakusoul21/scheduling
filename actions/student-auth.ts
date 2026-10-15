"use server";

import bcrypt from "bcryptjs";
import { headers } from "next/headers";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { AUTH } from "@/lib/auth/config";
import { verifyCaptcha } from "@/lib/auth/captcha";
import { clientIp } from "@/lib/auth/rate-limit";
import { registrableSections } from "@/lib/students/sections";
import { NO_PROGRAM_OPTION, studentRegisterSchema, type StudentRegisterInput } from "@/lib/validation/auth";
import { sendVerification } from "@/lib/auth/verification";
import type { ActionResult } from "./auth";

const TAKEN_EMAIL = "An account with this email already exists.";
const TAKEN_NUMBER = "This student number or Learner Reference Number is already registered.";

/** Creates a Student account; the student signs in after verifying their email. */
export async function studentRegisterAction(input: StudentRegisterInput & { captchaToken?: string }): Promise<ActionResult> {
  const parsed = studentRegisterSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0] ?? "form")] ??= i.message;
    return { ok: false, fieldErrors };
  }
  if (!(await verifyCaptcha(input.captchaToken, clientIp(await headers())))) {
    return { ok: false, error: "CAPTCHA verification failed. Please try again." };
  }

  const { studentNumber, name, email, programId, yearLevel, sectionId, password } = parsed.data;
  const section = (await registrableSections()).find((s) => s.id === sectionId);
  const program = programId === NO_PROGRAM_OPTION ? "" : programId;
  if (!section || section.programId !== program || section.stageKey !== yearLevel) {
    return { ok: false, fieldErrors: { sectionId: "Choose a section that matches your program or strand and year level." } };
  }

  const [emailTaken, numberTaken] = await Promise.all([
    prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } }, select: { id: true } }),
    prisma.student.findFirst({ where: { studentNumber: { equals: studentNumber, mode: "insensitive" } }, select: { id: true } }),
  ]);
  if (emailTaken || numberTaken) {
    return { ok: false, fieldErrors: { ...(emailTaken && { email: TAKEN_EMAIL }), ...(numberTaken && { studentNumber: TAKEN_NUMBER }) } };
  }

  let user;
  try {
    user = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash: await bcrypt.hash(password, AUTH.bcryptRounds),
        role: "STUDENT",
        status: "ACTIVE",
        termsAcceptedAt: new Date(),
        student: { create: { studentNumber, sectionId } },
      },
    });
  } catch (error) {
    // Another registration with the same email or number won the race.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const target = String(error.meta?.target ?? "");
      return { ok: false, fieldErrors: target.includes("studentNumber") ? { studentNumber: TAKEN_NUMBER } : { email: TAKEN_EMAIL } };
    }
    throw error;
  }
  await prisma.auditLog.create({ data: { userId: user.id, action: "Registered student account", entity: "User", entityId: user.id } });
  await sendVerification(user);
  return { ok: true };
}
