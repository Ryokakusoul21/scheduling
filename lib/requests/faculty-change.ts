import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { ACADEMIC_LEVELS } from "@/lib/academics/levels";
import { notifyUsers } from "@/lib/notify";

/** Fields a Head of Department may ask the Registrar to change on a faculty record. */
export const facultyChangeSchema = z
  .object({
    fullName: z.string().trim().min(1).max(120),
    email: z.string().trim().email(),
    position: z.string().trim().max(80),
    specialization: z.string().trim().max(120),
    maxHours: z.coerce.number().int().min(1).max(80),
    status: z.enum(["ACTIVE", "INACTIVE", "ON_LEAVE"]),
    teachingLevels: z.array(z.enum(ACADEMIC_LEVELS)).min(1),
  })
  .partial();

export type FacultyChanges = z.infer<typeof facultyChangeSchema>;

export const FACULTY_FIELD_LABELS: Record<keyof FacultyChanges, string> = {
  fullName: "Full name",
  email: "Email",
  position: "Position",
  specialization: "Specialization",
  maxHours: "Maximum teaching hours",
  status: "Employment status",
  teachingLevels: "Teaches at",
};

export interface FacultyChangeDetails {
  kind: "FACULTY_CHANGE";
  facultyId: string;
  facultyName: string;
  changes: FacultyChanges;
  summary: string;
}

export function describeChanges(changes: FacultyChanges) {
  return (Object.entries(changes) as [keyof FacultyChanges, unknown][])
    .map(([k, v]) => `${FACULTY_FIELD_LABELS[k]}: ${Array.isArray(v) ? v.join(", ") : String(v)}`)
    .join("; ");
}

/** Applies an approved faculty change request to the record. */
export async function applyFacultyChange(requestId: string, reviewer: { userId: string; name: string }) {
  const request = await prisma.scheduleRequest.findUnique({ where: { id: requestId } });
  const details = request?.details as unknown as FacultyChangeDetails | undefined;
  if (!request || details?.kind !== "FACULTY_CHANGE") return "This request has no faculty change to apply.";
  const parsed = facultyChangeSchema.safeParse(details.changes);
  if (!parsed.success) return "The requested changes are no longer valid.";
  try {
    await prisma.faculty.update({ where: { id: details.facultyId }, data: parsed.data });
  } catch {
    return "Another faculty member already uses that email.";
  }
  await prisma.scheduleRequest.update({ where: { id: requestId }, data: { status: "COMPLETED" } });
  await prisma.auditLog.create({
    data: { userId: reviewer.userId, action: `Applied faculty record change for ${details.facultyName}`, entity: "Faculty", entityId: details.facultyId, newValue: parsed.data },
  });
  await notifyUsers([request.requestedById], { title: "Faculty record change applied", message: `${details.facultyName}: ${details.summary}`, link: "/faculty", type: "SUCCESS" });
  return null;
}
