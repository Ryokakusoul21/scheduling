"use server";

import { z } from "zod";
import type { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { AUTH } from "@/lib/auth/config";
import { appUrl, sendMail } from "@/lib/email/mailer";
import { accountApprovedEmail } from "@/lib/email/templates";
import { passwordSchema } from "@/lib/validation/auth";
import { deleteAvatarFiles } from "@/lib/avatar/storage";
import { assertSingleDepartmentHead, lockDepartmentHeads } from "@/lib/departments/head-guard";
import { DepartmentHeadConflictError } from "@/lib/departments/heads";
import { facultyContactPending } from "@/lib/admin/faculty-alignment";

const ADMIN = ["SUPER_ADMINISTRATOR"] as const;
class FacultyAccountError extends Error {}

/** Random 12-character password that always satisfies the password rules. */
function generatePassword() {
  const sets = ["ABCDEFGHJKLMNPQRSTUVWXYZ", "abcdefghijkmnpqrstuvwxyz", "23456789", "!@#$%&*?"];
  const all = sets.join("");
  const pick = (chars: string) => chars[randomInt(chars.length)];
  const chars = [...sets.map(pick), ...Array.from({ length: 8 }, () => pick(all))];
  for (let i = chars.length - 1; i > 0; i--) { const j = randomInt(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
  return chars.join("");
}

const createSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  role: z.enum(["SUPER_ADMINISTRATOR", "REGISTRAR", "HEAD_OF_DEPARTMENT", "FACULTY"]),
  departmentId: z.string().optional(),
  facultyId: z.string().optional(),
  password: passwordSchema,
});

/** Replaces the account's permanent department assignment; acting and dated assignments are kept. */
async function setDepartment(tx: Prisma.TransactionClient, userId: string, departmentId?: string) {
  await tx.userDepartmentAssignment.deleteMany({ where: { userId, acting: false, startsAt: null, endsAt: null } });
  if (departmentId) await tx.userDepartmentAssignment.upsert({ where: { userId_departmentId: { userId, departmentId } }, update: { acting: false, startsAt: null, endsAt: null }, create: { userId, departmentId } });
}

export async function createUserAction(formData: FormData) {
  const admin = await requireRole(...ADMIN);
  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const d = parsed.data;

  try {
    const passwordHash = await bcrypt.hash(d.password, AUTH.bcryptRounds);
    await prisma.$transaction(async (tx) => {
      await lockDepartmentHeads(tx);
      const teaching = d.role === "FACULTY" || d.role === "HEAD_OF_DEPARTMENT";
      const faculty = d.facultyId ? await tx.faculty.findUnique({ where: { id: d.facultyId }, include: { user: { select: { id: true } } } }) : null;
      if (teaching && !faculty) throw new FacultyAccountError("Choose a faculty record maintained by the Registrar before creating a teaching account.");
      if (d.facultyId && !teaching) throw new FacultyAccountError("Faculty links are for Faculty and Head of Department accounts.");
      if (faculty?.archivedAt || faculty?.user) throw new FacultyAccountError("This faculty record is archived or already has an account. Review its existing account.");
      if (faculty && facultyContactPending(faculty.email)) throw new FacultyAccountError("The Registrar must replace this faculty member's temporary contact email before an account can be created.");
      const user = await tx.user.create({
        // Admin-created accounts are trusted, so they skip email verification.
        data: {
          name: faculty?.fullName ?? d.name,
          email: faculty?.email ?? d.email,
          facultyId: faculty?.id ?? null,
          role: d.role,
          passwordHash,
          status: "ACTIVE",
          emailVerified: new Date(),
        },
      });
      await setDepartment(tx, user.id, faculty ? faculty.departmentId ?? undefined : d.departmentId);
      await assertSingleDepartmentHead(tx, user.id);
      await tx.auditLog.create({
        data: { userId: admin.id, action: `Created user account (${d.role})`, entity: "User", entityId: user.id },
      });
    });
    revalidatePath("/admin/users");
    revalidatePath("/admin/departments");
    revalidatePath("/faculty");
    return { ok: true };
  } catch (error) {
    if (error instanceof DepartmentHeadConflictError || error instanceof FacultyAccountError) return { ok: false, error: error.message };
    return { ok: false, error: "A user with that email already exists." };
  }
}

const updateSchema = z.object({
  name: z.string().min(1),
  role: z.enum(["SUPER_ADMINISTRATOR", "REGISTRAR", "HEAD_OF_DEPARTMENT", "FACULTY"]).optional(),
  status: z.enum(["PENDING", "ACTIVE", "INACTIVE", "SUSPENDED"]),
  departmentId: z.string().optional(),
});

export async function updateUserAction(id: string, formData: FormData) {
  const admin = await requireRole(...ADMIN);
  const parsed = updateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  try {
    await prisma.$transaction(async (tx) => {
      await lockDepartmentHeads(tx);
      // Student accounts keep their role; only the name and status can change here.
      const target = await tx.user.findUnique({ where: { id }, select: { role: true, faculty: { select: { fullName: true, departmentId: true } } } });
      if (!target) throw new FacultyAccountError("This account no longer exists.");
      const { departmentId, ...account } = parsed.data;
      await tx.user.update({ where: { id }, data: target.role === "STUDENT" ? { name: account.name, status: account.status } : { ...account, name: target.faculty?.fullName ?? account.name } });
      if (target.role !== "STUDENT") await setDepartment(tx, id, target.faculty && (account.role ?? target.role) === "FACULTY" ? target.faculty.departmentId ?? undefined : departmentId);
      await assertSingleDepartmentHead(tx, id);
      await tx.auditLog.create({
        data: { userId: admin.id, action: "Updated user account", entity: "User", entityId: id },
      });
    });
  } catch (error) {
    if (error instanceof DepartmentHeadConflictError || error instanceof FacultyAccountError) return { ok: false, error: error.message };
    throw error;
  }
  revalidatePath("/admin/users");
  revalidatePath("/admin/departments");
  return { ok: true };
}

/** Explicit identity linking; never matches by name or changes a login address, role, or access status. */
export async function linkFacultyAccountAction(userId: string, facultyId: string) {
  const admin = await requireRole(...ADMIN);
  if (!userId.trim() || !facultyId.trim()) return { ok: false, error: "Choose both an account and a faculty record." };
  try {
    await prisma.$transaction(async (tx) => {
      await lockDepartmentHeads(tx);
      const [user, faculty] = await Promise.all([
        tx.user.findUnique({ where: { id: userId }, select: { role: true, facultyId: true, archivedAt: true, name: true } }),
        tx.faculty.findUnique({ where: { id: facultyId }, include: { user: { select: { id: true } } } }),
      ]);
      if (!user || user.archivedAt || !["FACULTY", "HEAD_OF_DEPARTMENT"].includes(user.role)) throw new FacultyAccountError("Choose an unarchived teaching account.");
      if (!faculty || faculty.archivedAt) throw new FacultyAccountError("Choose a current faculty record from the Registrar's roster.");
      if (user.facultyId && user.facultyId !== facultyId) throw new FacultyAccountError("This account already has a faculty identity. Review that record before replacing its link.");
      if (faculty.user && faculty.user.id !== userId) throw new FacultyAccountError("This faculty member already has an account.");
      if (user.role === "HEAD_OF_DEPARTMENT" && facultyContactPending(faculty.email)) throw new FacultyAccountError("Verify the faculty contact details before linking a department-head account.");
      await tx.user.update({ where: { id: userId }, data: { facultyId, name: faculty.fullName, ...(user.facultyId !== facultyId ? { sessionVersion: { increment: 1 } } : {}) } });
      await assertSingleDepartmentHead(tx, userId);
      await tx.auditLog.create({ data: { userId: admin.id, action: "Linked account to Registrar faculty record", entity: "User", entityId: userId,
        oldValue: { facultyId: user.facultyId, name: user.name }, newValue: { facultyId, name: faculty.fullName, employeeId: faculty.employeeId, departmentId: faculty.departmentId } } });
    });
  } catch (error) {
    if (error instanceof FacultyAccountError || error instanceof DepartmentHeadConflictError) return { ok: false, error: error.message };
    return { ok: false, error: "This faculty record or account changed. Refresh and review its current link." };
  }
  for (const path of ["/admin/users", "/faculty", "/admin/departments"]) revalidatePath(path);
  return { ok: true };
}

/** Issues a generated password, signs the user out everywhere, and forces a change on next login. */
export async function resetPasswordAction(id: string) {
  const admin = await requireRole(...ADMIN);
  const password = generatePassword();
  await prisma.user.update({
    where: { id },
    data: { passwordHash: await bcrypt.hash(password, AUTH.bcryptRounds), mustChangePassword: true, sessionVersion: { increment: 1 }, failedLoginAttempts: 0, lockedUntil: null },
  });
  await prisma.auditLog.create({ data: { userId: admin.id, action: "Reset user password", entity: "User", entityId: id } });
  revalidatePath("/admin/users");
  return { ok: true as const, password };
}

const gmailSchema = z.string().trim().toLowerCase().email("Enter a valid email address.");

type Provisioned = { ok: true; password: string } | { ok: false; error: string };

/** Creates one roster faculty login with a generated password; shared by single and bulk creation. */
async function provisionFacultyAccount(adminId: string, where: { id: string } | { employeeId: string }, email: string, role: string, departmentId?: string): Promise<Provisioned> {
  const parsed = gmailSchema.safeParse(email);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid email." };
  if (role !== "FACULTY" && role !== "HEAD_OF_DEPARTMENT") return { ok: false, error: "Role must be Faculty or Head of Department." };
  const password = generatePassword();
  try {
    await prisma.$transaction(async (tx) => {
      await lockDepartmentHeads(tx);
      const faculty = await tx.faculty.findUnique({ where: where as Prisma.FacultyWhereUniqueInput, include: { user: { select: { id: true } } } });
      if (!faculty || faculty.archivedAt) throw new FacultyAccountError("Not on the faculty roster.");
      if (departmentId && faculty.departmentId !== departmentId) throw new FacultyAccountError("Other department.");
      if (faculty.user) throw new FacultyAccountError("Already has an account.");
      if (await tx.user.findUnique({ where: { email: parsed.data }, select: { id: true } })) throw new FacultyAccountError("Email already used by another account.");
      const user = await tx.user.create({
        data: { name: faculty.fullName, email: parsed.data, facultyId: faculty.id, role, status: "ACTIVE", emailVerified: new Date(), mustChangePassword: true, passwordHash: await bcrypt.hash(password, AUTH.bcryptRounds) },
      });
      await setDepartment(tx, user.id, faculty.departmentId ?? undefined);
      await assertSingleDepartmentHead(tx, user.id);
      await tx.auditLog.create({ data: { userId: adminId, action: `Created faculty account (${role})`, entity: "User", entityId: user.id, newValue: { facultyId: faculty.id, employeeId: faculty.employeeId } } });
    });
  } catch (error) {
    if (error instanceof FacultyAccountError || error instanceof DepartmentHeadConflictError) return { ok: false, error: error.message };
    return { ok: false, error: "Could not create the account." };
  }
  return { ok: true, password };
}

/** Creates a login for a roster faculty member with the given email and a generated one-time password. */
export async function createFacultyAccountAction(facultyId: string, email: string, role: "FACULTY" | "HEAD_OF_DEPARTMENT") {
  const admin = await requireRole(...ADMIN);
  const result = await provisionFacultyAccount(admin.id, { id: facultyId }, email, role);
  if (result.ok) for (const path of ["/admin/users", "/faculty", "/admin/departments"]) revalidatePath(path);
  return result;
}

export type BulkAccountRow = { employeeId: string; email: string; role: string };
export type BulkAccountResult = BulkAccountRow & ({ ok: true; password: string } | { ok: false; error: string });

/** Creates many roster logins at once; each row succeeds or fails on its own. */
export async function createFacultyAccountsBulkAction(departmentId: string, rows: BulkAccountRow[]): Promise<{ ok: true; results: BulkAccountResult[] } | { ok: false; error: string }> {
  const admin = await requireRole(...ADMIN);
  if (!departmentId) return { ok: false, error: "Choose a department." };
  if (!Array.isArray(rows) || !rows.length) return { ok: false, error: "No rows to create." };
  if (rows.length > 300) return { ok: false, error: "Up to 300 rows per upload." };
  const results: BulkAccountResult[] = [];
  for (const row of rows) {
    const clean = { employeeId: String(row.employeeId ?? "").trim(), email: String(row.email ?? "").trim().toLowerCase(), role: String(row.role ?? "").trim() || "FACULTY" };
    results.push({ ...clean, ...(await provisionFacultyAccount(admin.id, { employeeId: clean.employeeId }, clean.email, clean.role, departmentId)) });
  }
  for (const path of ["/admin/users", "/faculty", "/admin/departments"]) revalidatePath(path);
  return { ok: true, results };
}

/** Changes the login email; the user is signed out so the next login uses the new address. */
export async function changeEmailAction(id: string, email: string) {
  const admin = await requireRole(...ADMIN);
  const parsed = gmailSchema.safeParse(email);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const taken = await prisma.user.findUnique({ where: { email: parsed.data }, select: { id: true } });
  if (taken && taken.id !== id) return { ok: false, error: "This email is already used by another account." };
  const before = await prisma.user.findUniqueOrThrow({ where: { id }, select: { email: true } });
  await prisma.user.update({ where: { id }, data: { email: parsed.data, sessionVersion: { increment: 1 } } });
  await prisma.auditLog.create({ data: { userId: admin.id, action: "Changed login email", entity: "User", entityId: id, oldValue: { email: before.email }, newValue: { email: parsed.data } } });
  revalidatePath("/admin/users");
  return { ok: true };
}

/** Suspends or reactivates login access; suspension signs the user out everywhere. */
export async function setAccountStatusAction(id: string, status: "ACTIVE" | "SUSPENDED") {
  const admin = await requireRole(...ADMIN);
  if (id === admin.id) return { ok: false, error: "You cannot suspend your own account." };
  await prisma.user.update({ where: { id }, data: { status, ...(status === "SUSPENDED" ? { sessionVersion: { increment: 1 } } : {}) } });
  await prisma.auditLog.create({ data: { userId: admin.id, action: status === "SUSPENDED" ? "Suspended user account" : "Reactivated user account", entity: "User", entityId: id } });
  revalidatePath("/admin/users");
  return { ok: true };
}

export async function approveUserAction(id: string) {
  const admin = await requireRole(...ADMIN);
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user || user.status !== "PENDING") return { ok: false, error: "This account is not awaiting approval." };

  try {
    await prisma.$transaction(async (tx) => {
      await lockDepartmentHeads(tx);
      await tx.user.update({ where: { id }, data: { status: "ACTIVE" } });
      await assertSingleDepartmentHead(tx, id);
      await tx.auditLog.create({
        data: { userId: admin.id, action: "Approved user account", entity: "User", entityId: id },
      });
    });
  } catch (error) {
    if (error instanceof DepartmentHeadConflictError) return { ok: false, error: error.message };
    throw error;
  }
  await prisma.notification.create({
    data: { userId: id, type: "SUCCESS", title: "Welcome!", message: "Your account has been approved." },
  });
  await sendMail(accountApprovedEmail(user.email, user.name, appUrl("/login")));
  revalidatePath("/admin/users");
  revalidatePath("/admin/departments");
  return { ok: true };
}

/** Moderation: removes another user's profile photo. */
export async function removeUserAvatarAction(id: string) {
  const admin = await requireRole(...ADMIN);
  const user = await prisma.user.findUnique({ where: { id }, select: { image: true } });
  if (!user?.image) return { ok: false, error: "This user has no profile photo." };
  await prisma.user.update({ where: { id }, data: { image: null } });
  await deleteAvatarFiles(user.image);
  await prisma.auditLog.create({
    data: { userId: admin.id, action: "Removed user profile photo", entity: "User", entityId: id, role: admin.role },
  });
  revalidatePath("/admin/users");
  return { ok: true };
}
