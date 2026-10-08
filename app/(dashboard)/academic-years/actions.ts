"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import type { AcademicLevel, SemesterType } from "@prisma/client";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { STAFF_ROLES } from "@/lib/permissions/roles";
import { ACADEMIC_LEVELS, QUARTER_TYPES, SEMESTER_TYPES, LEVELS, termLabel } from "@/lib/academics/levels";

type Result = { ok: boolean; error?: string };

function revalidate(yearId?: string) {
  revalidatePath("/academic-years");
  if (yearId) revalidatePath(`/academic-years/${yearId}`);
  revalidatePath("/scheduler");
}

// ---------------------------------------------------------------------------
// Academic years
// ---------------------------------------------------------------------------

const yearSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").regex(/^\d{4}-\d{4}$/, "Use the format 2025-2026"),
    startDate: z.string().min(1, "Start date is required"),
    endDate: z.string().min(1, "End date is required"),
    isActive: z.literal("true").optional(),
  })
  .refine((d) => new Date(d.endDate) > new Date(d.startDate), { message: "End date must be after the start date" });

export async function saveAcademicYearAction(id: string | null, formData: FormData): Promise<Result> {
  await requireRole(...STAFF_ROLES);
  const parsed = yearSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const { name, startDate, endDate, isActive } = parsed.data;
  const data = { name, startDate: new Date(startDate), endDate: new Date(endDate), isActive: !!isActive };

  try {
    const saved = id
      ? await prisma.academicYear.update({ where: { id }, data })
      : await prisma.academicYear.create({ data });
    if (data.isActive) {
      await prisma.academicYear.updateMany({ where: { id: { not: saved.id } }, data: { isActive: false } });
    }
    revalidate(saved.id);
    return { ok: true };
  } catch {
    return { ok: false, error: "An academic year with that name already exists." };
  }
}

export async function setActiveAcademicYearAction(id: string): Promise<Result> {
  await requireRole(...STAFF_ROLES);
  await prisma.$transaction([
    prisma.academicYear.updateMany({ data: { isActive: false } }),
    prisma.academicYear.update({ where: { id }, data: { isActive: true } }),
  ]);
  revalidate(id);
  return { ok: true };
}

export async function deleteAcademicYearAction(id: string): Promise<Result> {
  await requireRole(...STAFF_ROLES);
  const terms = await prisma.semester.count({ where: { academicYearId: id } });
  if (terms > 0) return { ok: false, error: `Delete its ${terms} term(s) first.` };
  await prisma.academicYear.delete({ where: { id } });
  revalidate();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Terms (College semesters per course, basic-education quarters)
// ---------------------------------------------------------------------------

const termSchema = z
  .object({
    academicYearId: z.string().min(1),
    level: z.enum(ACADEMIC_LEVELS),
    programId: z.string().optional(),
    type: z.enum([...SEMESTER_TYPES, ...QUARTER_TYPES]),
    startDate: z.string().min(1, "Start date is required"),
    endDate: z.string().min(1, "End date is required"),
    isActive: z.literal("true").optional(),
  })
  .refine((d) => new Date(d.endDate) > new Date(d.startDate), { message: "End date must be after the start date" })
  .refine((d) => (LEVELS[d.level].termKind === "semester") === (SEMESTER_TYPES as readonly string[]).includes(d.type), {
    message: "College uses semesters; basic education uses quarters",
  });

/** Only one active term per level and course at a time. */
async function activateTerm(id: string, level: AcademicLevel, programId: string | null) {
  await prisma.semester.updateMany({
    where: { id: { not: id }, level, programId },
    data: { isActive: false },
  });
}

export async function saveTermAction(id: string | null, formData: FormData): Promise<Result> {
  await requireRole(...STAFF_ROLES);
  const parsed = termSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const d = parsed.data;
  const programId = d.level === "COLLEGE" && d.programId ? d.programId : null;

  const duplicate = await prisma.semester.findFirst({
    where: { academicYearId: d.academicYearId, level: d.level, programId, type: d.type, id: id ? { not: id } : undefined },
  });
  if (duplicate) return { ok: false, error: `${termLabel(d.type)} already exists here.` };

  const data = {
    academicYearId: d.academicYearId,
    level: d.level,
    programId,
    type: d.type,
    name: termLabel(d.type),
    startDate: new Date(d.startDate),
    endDate: new Date(d.endDate),
    isActive: !!d.isActive,
  };
  const saved = id ? await prisma.semester.update({ where: { id }, data }) : await prisma.semester.create({ data });
  if (saved.isActive) await activateTerm(saved.id, saved.level, saved.programId);
  revalidate(d.academicYearId);
  return { ok: true };
}

export async function setActiveTermAction(id: string): Promise<Result> {
  await requireRole(...STAFF_ROLES);
  const term = await prisma.semester.update({ where: { id }, data: { isActive: true } });
  await activateTerm(term.id, term.level, term.programId);
  revalidate(term.academicYearId);
  return { ok: true };
}

export async function deleteTermAction(id: string): Promise<Result> {
  await requireRole(...STAFF_ROLES);
  const [schedules, sections] = await Promise.all([
    prisma.schedule.count({ where: { semesterId: id } }),
    prisma.section.count({ where: { semesterId: id } }),
  ]);
  if (schedules > 0) return { ok: false, error: `This term has ${schedules} scheduled class(es); remove them in the Scheduler first.` };
  if (sections > 0) return { ok: false, error: `${sections} section(s) are assigned to this term; reassign them first.` };
  const term = await prisma.semester.delete({ where: { id } });
  revalidate(term.academicYearId);
  return { ok: true };
}

/**
 * Creates any missing terms for a level (and course): four equal quarters for
 * basic education, or 1st/2nd semester + summer for College.
 */
export async function createDefaultTermsAction(academicYearId: string, level: AcademicLevel, programId: string | null): Promise<Result> {
  await requireRole(...STAFF_ROLES);
  const year = await prisma.academicYear.findUnique({ where: { id: academicYearId } });
  if (!year) return { ok: false, error: "Academic year not found." };

  const start = year.startDate.getTime();
  const span = year.endDate.getTime() - start;
  const day = 24 * 60 * 60 * 1000;
  const slices: { type: SemesterType; from: number; to: number }[] =
    LEVELS[level].termKind === "quarter"
      ? QUARTER_TYPES.map((type, i) => ({ type, from: i / 4, to: (i + 1) / 4 }))
      : [
          { type: "FIRST", from: 0, to: 0.45 },
          { type: "SECOND", from: 0.45, to: 0.9 },
          { type: "SUMMER", from: 0.9, to: 1 },
        ];

  const existing = await prisma.semester.findMany({
    where: { academicYearId, level, programId: level === "COLLEGE" ? programId : null },
    select: { type: true },
  });
  const have = new Set(existing.map((t) => t.type));
  const missing = slices.filter((s) => !have.has(s.type));
  if (missing.length === 0) return { ok: false, error: "All terms already exist." };

  await prisma.semester.createMany({
    data: missing.map((s) => ({
      academicYearId,
      level,
      programId: level === "COLLEGE" ? programId : null,
      type: s.type,
      name: termLabel(s.type),
      startDate: new Date(start + Math.round(span * s.from)),
      endDate: new Date(start + Math.round(span * s.to) - (s.to < 1 ? day : 0)),
    })),
  });
  revalidate(academicYearId);
  return { ok: true };
}
