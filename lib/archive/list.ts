import "server-only";
import { prisma } from "@/lib/db/prisma";
import { ROLE_LABELS } from "@/lib/permissions/roles";
import type { ArchiveKind } from "./kinds";

export interface ArchivedRow {
  kind: ArchiveKind;
  id: string;
  name: string;
  /** Role for accounts, otherwise a short description such as the room type. */
  detail: string;
  department: string;
  archivedAt: string;
  archivedBy: string;
  reason: string;
}

const ARCHIVED = { archivedAt: { not: null } };
// A faculty record archived together with its account is listed once, under the account.
const STANDALONE_FACULTY = { ...ARCHIVED, OR: [{ user: null }, { user: { archivedAt: null } }] };

export async function countArchived() {
  const counts = await Promise.all([
    prisma.user.count({ where: ARCHIVED }),
    prisma.faculty.count({ where: STANDALONE_FACULTY }),
    prisma.subject.count({ where: ARCHIVED }),
    prisma.room.count({ where: ARCHIVED }),
    prisma.section.count({ where: ARCHIVED }),
  ]);
  return counts.reduce((a, b) => a + b, 0);
}

/** Every archived record, newest first, with who archived it and why. */
export async function listArchived(): Promise<ArchivedRow[]> {
  const programDept = { program: { select: { department: { select: { name: true } } } } };
  const [users, faculty, subjects, rooms, sections] = await Promise.all([
    prisma.user.findMany({
      where: ARCHIVED,
      include: { faculty: { select: { department: { select: { name: true } } } }, student: { select: { section: { select: programDept } } } },
    }),
    prisma.faculty.findMany({ where: STANDALONE_FACULTY, include: { department: { select: { name: true } } } }),
    prisma.subject.findMany({ where: ARCHIVED, include: programDept }),
    prisma.room.findMany({ where: ARCHIVED, include: { department: { select: { name: true } } } }),
    prisma.section.findMany({ where: ARCHIVED, include: programDept }),
  ]);

  const actorIds = [...users, ...faculty, ...subjects, ...rooms, ...sections].map((r) => r.archivedById).filter((id): id is string => !!id);
  const actors = new Map((await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));

  const base = (r: { id: string; archivedAt: Date | null; archivedById: string | null; archiveReason: string | null }) => ({
    id: r.id,
    archivedAt: r.archivedAt!.toISOString(),
    archivedBy: (r.archivedById && actors.get(r.archivedById)) || "Unknown",
    reason: r.archiveReason ?? "",
  });
  const NONE = "No department";

  const rows: ArchivedRow[] = [
    ...users.map((u) => ({
      ...base(u),
      kind: "USER" as const,
      name: `${u.name} (${u.email})`,
      detail: ROLE_LABELS[u.role],
      department: u.faculty?.department?.name ?? u.student?.section?.program?.department?.name ?? NONE,
    })),
    ...faculty.map((f) => ({ ...base(f), kind: "FACULTY" as const, name: `${f.fullName} (${f.employeeId})`, detail: "Faculty record", department: f.department?.name ?? NONE })),
    ...subjects.map((s) => ({ ...base(s), kind: "SUBJECT" as const, name: `${s.code} ${s.name}`, detail: "Subject", department: s.program?.department?.name ?? NONE })),
    ...rooms.map((r) => ({ ...base(r), kind: "ROOM" as const, name: `${r.roomNumber} ${r.roomName}`, detail: "Room", department: r.department?.name ?? "Shared" })),
    ...sections.map((s) => ({ ...base(s), kind: "SECTION" as const, name: s.name, detail: "Section", department: s.program?.department?.name ?? NONE })),
  ];
  return rows.sort((a, b) => b.archivedAt.localeCompare(a.archivedAt));
}
