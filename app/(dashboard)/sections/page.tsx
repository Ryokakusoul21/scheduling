import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { STAFF_ROLES } from "@/lib/permissions/roles";
import { flowHref, isComplete, parseFlow } from "@/lib/academics/flow";
import { LEVELS, gradeLabel, levelLabel, termLabel, yearLabel } from "@/lib/academics/levels";
import { LevelFlow } from "@/components/academics/level-flow";
import { PageHeader } from "@/components/ux/states";
import { cn } from "@/lib/utils";
import { SectionsGrid } from "./sections-grid";

export const metadata = { title: "Sections · GRANBY COLLEGES OF SCIENCE & TECHNOLOGY" };

export default async function SectionsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireRole(...STAFF_ROLES);
  const flow = parseFlow(await searchParams);

  const [all, programs] = await Promise.all([
    prisma.section.findMany({ where: { archivedAt: null }, select: { level: true, programId: true, yearLevel: true, gradeLevel: true } }),
    prisma.program.findMany({ orderBy: [{ sortOrder: "asc" }, { code: "asc" }], select: { id: true, code: true, name: true, level: true } }),
  ]);

  let list: React.ReactNode = null;
  if (isComplete(flow) && flow.level) {
    const where =
      flow.level === "COLLEGE"
        ? { level: flow.level, programId: flow.programId, yearLevel: flow.year as never }
        : { level: flow.level, gradeLevel: flow.grade, ...(flow.strand ? { programId: flow.strand } : {}) };
    const [sections, terms] = await Promise.all([
      prisma.section.findMany({
        where: { ...where, archivedAt: null },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        include: {
          program: { select: { code: true } },
          semester: { select: { type: true, academicYear: { select: { name: true } } } },
          _count: { select: { schedules: true } },
        },
      }),
      flow.level === "COLLEGE"
        ? prisma.semester.findMany({
            where: { level: "COLLEGE", OR: [{ programId: null }, { programId: flow.programId }] },
            include: { academicYear: true, program: { select: { code: true } } },
            orderBy: { startDate: "desc" },
          })
        : Promise.resolve([]),
    ]);
    const strands = programs.filter((p) => p.level === "SENIOR_HIGH");
    const program = programs.find((p) => p.id === flow.programId);
    const heading =
      flow.level === "COLLEGE" ? `${program?.code ?? ""} · ${yearLabel(flow.year!)}` : `${levelLabel(flow.level)} · ${gradeLabel(flow.grade!)}`;

    list = (
      <div className="space-y-3">
        {flow.level === "SENIOR_HIGH" && (
          <nav aria-label="Filter by strand" className="flex flex-wrap gap-1.5">
            {[{ id: null as string | null, code: "All strands" }, ...strands].map((s) => (
              <Link
                key={s.code}
                href={flowHref("/sections", { ...flow, strand: s.id })}
                aria-current={flow.strand === s.id ? "page" : undefined}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors hover:bg-accent",
                  flow.strand === s.id && "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
                )}
              >
                {s.code}
              </Link>
            ))}
          </nav>
        )}
        <SectionsGrid
          heading={heading}
          context={{
            level: flow.level,
            programId: flow.level === "COLLEGE" ? (flow.programId ?? "") : (flow.strand ?? ""),
            yearLevel: flow.level === "COLLEGE" ? (flow.year ?? "") : "",
            gradeLevel: flow.grade ?? "",
          }}
          strands={LEVELS[flow.level].usesPrograms && flow.level === "SENIOR_HIGH" ? strands.map((s) => ({ value: s.id, label: `${s.code} — ${s.name}` })) : []}
          terms={terms.map((t) => ({ value: t.id, label: `A.Y. ${t.academicYear.name} · ${termLabel(t.type)}${t.program ? ` (${t.program.code})` : ""}` }))}
          sections={sections.map((s) => ({
            id: s.id,
            name: s.name,
            studentCount: s.studentCount,
            level: s.level,
            programId: s.programId ?? "",
            program: s.program?.code ?? null,
            yearLevel: s.yearLevel ?? "",
            gradeLevel: s.gradeLevel ?? "",
            semesterId: s.semesterId ?? "",
            term: s.semester ? `${s.semester.academicYear.name} · ${termLabel(s.semester.type)}` : null,
            classes: s._count.schedules,
          }))}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Sections" description="Pick a level and year or grade to create and manage its class sections." />
      <LevelFlow basePath="/sections" rootLabel="Sections" noun="sections" flow={flow} rows={all} programs={programs} />
      {list}
    </div>
  );
}
