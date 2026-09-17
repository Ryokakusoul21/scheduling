"use server";

import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

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
      where: { OR: [{ code: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] },
      take: 5,
    }),
    prisma.faculty.findMany({
      where: {
        OR: [
          { fullName: { contains: q, mode: "insensitive" } },
          { employeeId: { contains: q, mode: "insensitive" } },
        ],
      },
      take: 5,
    }),
    prisma.room.findMany({
      where: {
        OR: [
          { roomName: { contains: q, mode: "insensitive" } },
          { roomNumber: { contains: q, mode: "insensitive" } },
        ],
      },
      take: 5,
    }),
    prisma.section.findMany({
      where: { name: { contains: q, mode: "insensitive" } },
      take: 5,
    }),
  ]);

  return [
    ...subjects.map((s) => ({
      id: s.id,
      label: `${s.code} — ${s.name}`,
      sublabel: `${s.units} units`,
      href: "/subjects",
      group: "Subjects" as const,
    })),
    ...faculty.map((f) => ({
      id: f.id,
      label: f.fullName,
      sublabel: f.employeeId,
      href: "/faculty",
      group: "Faculty" as const,
    })),
    ...rooms.map((r) => ({
      id: r.id,
      label: `${r.roomName} (${r.roomNumber})`,
      sublabel: r.roomType.replace(/_/g, " "),
      href: "/rooms",
      group: "Rooms" as const,
    })),
    ...sections.map((s) => ({
      id: s.id,
      label: s.name,
      sublabel: `${s.studentCount} students`,
      href: "/sections",
      group: "Sections" as const,
    })),
  ];
}
