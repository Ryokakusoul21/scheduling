import "server-only";
import { prisma } from "@/lib/db/prisma";

export const subjectCalendarSelect = {
  id: true, name: true, isActive: true,
  semesters: { where: { level: "COLLEGE" as const }, select: { id: true, name: true, type: true, programId: true, isActive: true } },
} as const;

export async function loadSubjectCalendar(id?: string) {
  return prisma.academicYear.findFirst({
    where: id ? { id } : undefined,
    orderBy: [{ isActive: "desc" }, { startDate: "desc" }],
    select: subjectCalendarSelect,
  });
}
