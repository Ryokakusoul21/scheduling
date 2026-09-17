"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { checkHardConstraints, checkFacultyWorkloadCap } from "@/lib/scheduler/constraintChecker";
import { toSchedEntry, toSchedFaculty, toSchedRoom, toSchedSubject } from "@/lib/scheduler/mappers";
import type { DayOfWeek, SubjectComponent } from "@/lib/scheduler/types";

const STAFF_ROLES = ["SUPER_ADMIN", "ADMINISTRATOR", "REGISTRAR", "SCHEDULER"] as const;

export async function updateScheduleStatusAction(id: string, status: "PUBLISHED" | "DRAFT" | "ARCHIVED") {
  const user = await requireRole(...STAFF_ROLES);
  const schedule = await prisma.schedule.update({ where: { id }, data: { status } });
  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: `Set schedule status to ${status}`,
      entity: "Schedule",
      entityId: id,
    },
  });
  revalidatePath("/schedules");
  revalidatePath("/dashboard");
  return { ok: true as const, schedule };
}

export async function deleteScheduleAction(id: string) {
  const user = await requireRole(...STAFF_ROLES);
  await prisma.schedule.delete({ where: { id } });
  await prisma.auditLog.create({
    data: { userId: user.id, action: "Deleted schedule entry", entity: "Schedule", entityId: id },
  });
  revalidatePath("/schedules");
  revalidatePath("/dashboard");
  return { ok: true as const };
}

export async function duplicateScheduleAction(id: string) {
  const user = await requireRole(...STAFF_ROLES);
  const original = await prisma.schedule.findUniqueOrThrow({ where: { id } });
  const created = await prisma.schedule.create({
    data: {
      semesterId: original.semesterId,
      subjectId: original.subjectId,
      sectionId: original.sectionId,
      facultyId: original.facultyId,
      roomId: original.roomId,
      component: original.component,
      dayOfWeek: original.dayOfWeek,
      startMin: original.startMin,
      endMin: original.endMin,
      status: "DRAFT",
      version: original.version,
      generatedBy: user.id,
      notes: "Duplicated from an existing entry",
    },
  });
  await prisma.auditLog.create({
    data: { userId: user.id, action: "Duplicated schedule entry", entity: "Schedule", entityId: created.id },
  });
  revalidatePath("/schedules");
  return { ok: true as const };
}

const createSchema = z.object({
  semesterId: z.string().min(1),
  subjectId: z.string().min(1),
  sectionId: z.string().min(1),
  facultyId: z.string().min(1),
  roomId: z.string().min(1),
  component: z.enum(["LECTURE", "LABORATORY"]),
  dayOfWeek: z.enum(["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"]),
  startMin: z.number().int().min(0),
  endMin: z.number().int().min(0),
});

export type CreateScheduleInput = z.infer<typeof createSchema>;

export async function createScheduleAction(input: CreateScheduleInput) {
  const user = await requireRole(...STAFF_ROLES);
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const data = parsed.data;

  if (data.endMin <= data.startMin) {
    return { ok: false as const, error: "End time must be after start time." };
  }

  const [faculty, room, subject, section, existing] = await Promise.all([
    prisma.faculty.findUnique({ where: { id: data.facultyId }, include: { availability: true } }),
    prisma.room.findUnique({ where: { id: data.roomId }, include: { availability: true } }),
    prisma.subject.findUnique({ where: { id: data.subjectId } }),
    prisma.section.findUnique({ where: { id: data.sectionId } }),
    prisma.schedule.findMany({ where: { semesterId: data.semesterId, status: { not: "ARCHIVED" } } }),
  ]);

  if (!faculty || !room || !subject || !section) {
    return { ok: false as const, error: "Faculty, room, subject, or section not found." };
  }

  const candidate = {
    subjectId: data.subjectId,
    sectionId: data.sectionId,
    facultyId: data.facultyId,
    roomId: data.roomId,
    component: data.component as SubjectComponent,
    dayOfWeek: data.dayOfWeek as DayOfWeek,
    startMin: data.startMin,
    endMin: data.endMin,
  };

  const violations = checkHardConstraints(candidate, existing.map(toSchedEntry), {
    faculty: toSchedFaculty(faculty),
    room: toSchedRoom(room),
    subject: toSchedSubject(subject),
    sectionStudentCount: section.studentCount,
  });
  const workloadViolations = checkFacultyWorkloadCap(
    toSchedFaculty(
      faculty,
      existing
        .filter((e) => e.facultyId === data.facultyId)
        .reduce((sum, e) => sum + (e.endMin - e.startMin), 0) / 60
    ),
    (data.endMin - data.startMin) / 60
  );

  const allViolations = [...violations, ...workloadViolations];
  if (allViolations.length > 0) {
    return { ok: false as const, error: allViolations.map((v) => v.message).join(" ") };
  }

  const created = await prisma.schedule.create({
    data: { ...candidate, semesterId: data.semesterId, status: "DRAFT", version: 1, generatedBy: user.id },
  });

  await prisma.auditLog.create({
    data: { userId: user.id, action: "Manually created schedule entry", entity: "Schedule", entityId: created.id },
  });

  revalidatePath("/schedules");
  revalidatePath("/dashboard");
  return { ok: true as const };
}
