"use server";

import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { ANY_YEAR, GENERAL, flowHref } from "@/lib/academics/flow";

export interface SearchResult {
  id: string;
  label: string;
  sublabel: string;
  href: string;
  group: "Subjects" | "Faculty" | "Rooms" | "Sections";
}

export async function globalSearchAction(query: string): Promise<SearchResult[]> {
  await requireUser();
  const q = query.trim();
  if (q.length < 2) return [];

  const [subjects, faculty, rooms, sections] = await Promise.all([
    prisma.subject.findMany({
      where: { archivedAt: null, OR: [{ code: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] },
      take: 5,
    }),
    prisma.faculty.findMany({
      where: {
        archivedAt: null,
        OR: [
          { fullName: { contains: q, mode: "insensitive" } },
          { employeeId: { contains: q, mode: "insensitive" } },
        ],
      },
      take: 5,
    }),
    prisma.room.findMany({
      where: {
        archivedAt: null,
        OR: [
          { roomName: { contains: q, mode: "insensitive" } },
          { roomNumber: { contains: q, mode: "insensitive" } },
        ],
      },
      take: 5,
    }),
    prisma.section.findMany({
      where: { archivedAt: null, name: { contains: q, mode: "insensitive" } },
      take: 5,
    }),
  ]);

  return [
    ...subjects.map((s) => ({
      id: s.id,
      label: `${s.code} — ${s.name}`,
      sublabel: `${s.units} units`,
      // Deep-link to the subject's own level/year (or grade) list.
      href:
        s.level === "COLLEGE"
          ? flowHref("/subjects", { level: s.level, programId: s.programId ?? GENERAL, year: s.yearLevel ?? ANY_YEAR })
          : flowHref("/subjects", { level: s.level, grade: s.gradeLevel }),
      group: "Subjects" as const,
    })),
    ...faculty.map((f) => ({
      id: f.id,
      label: f.fullName,
      sublabel: f.employeeId,
      href: `/faculty?q=${encodeURIComponent(f.fullName)}`,
      group: "Faculty" as const,
    })),
    ...rooms.map((r) => ({
      id: r.id,
      label: `${r.roomName} (${r.roomNumber})`,
      sublabel: r.roomType.replace(/_/g, " "),
      href: `/rooms?q=${encodeURIComponent(r.roomNumber)}`,
      group: "Rooms" as const,
    })),
    ...sections.map((s) => ({
      id: s.id,
      label: s.name,
      sublabel: `${s.studentCount} learners`,
      href: `/scheduler?level=${s.level}&sectionId=${s.id}`,
      group: "Sections" as const,
    })),
  ];
}
