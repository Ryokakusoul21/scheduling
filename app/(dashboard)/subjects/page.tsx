import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { STAFF_ROLES } from "@/lib/permissions/roles";
import { ANY_YEAR, GENERAL, flowHref, isComplete, parseFlow } from "@/lib/academics/flow";
import { LEVELS, gradeLabel, yearLabel } from "@/lib/academics/levels";
import { LevelFlow } from "@/components/academics/level-flow";
import { PageHeader } from "@/components/ux/states";
import { cn } from "@/lib/utils";
import { SubjectsList } from "./subjects-list";

export const metadata = { title: "Subjects · GRANBY COLLEGES OF SCIENCE & TECHNOLOGY" };

export default async function SubjectsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireRole(...STAFF_ROLES);
  const flow = parseFlow(await searchParams);

  const [all, programs] = await Promise.all([
    prisma.subject.findMany({ select: { level: true, programId: true, yearLevel: true, gradeLevel: true } }),
    prisma.program.findMany({ orderBy: [{ sortOrder: "asc" }, { code: "asc" }], select: { id: true, code: true, name: true, level: true } }),
  ]);

  let list: React.ReactNode = null;
  if (isComplete(flow) && flow.level) {
    const where =
      flow.level === "COLLEGE"
        ? {
            level: flow.level,
            programId: flow.programId === GENERAL ? null : flow.programId,
            yearLevel: flow.year === ANY_YEAR ? null : (flow.year as never),
          }
        : {
            level: flow.level,
            gradeLevel: flow.grade,
            ...(flow.strand ? { programId: flow.strand === "core" ? null : flow.strand } : {}),
          };
    const subjects = await prisma.subject.findMany({
      where,
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
      include: { program: { select: { code: true } }, _count: { select: { schedules: true } } },
    });
    const strands = programs.filter((p) => p.level === "SENIOR_HIGH");
    const context = {
      level: flow.level,
      programId: flow.level === "COLLEGE" ? (flow.programId === GENERAL ? "" : (flow.programId ?? "")) : flow.strand && flow.strand !== "core" ? flow.strand : "",
      yearLevel: flow.year && flow.year !== ANY_YEAR ? flow.year : "",
      gradeLevel: flow.grade ?? "",
    };
    const heading =
      flow.level === "COLLEGE"
        ? `${flow.programId === GENERAL ? "General Education" : programs.find((p) => p.id === flow.programId)?.code} · ${flow.year === ANY_YEAR ? "Any year" : yearLabel(flow.year!)}`
        : `${LEVELS[flow.level].label} · ${gradeLabel(flow.grade!)}`;

    list = (
      <div className="space-y-3">
        {flow.level === "SENIOR_HIGH" && (
          <nav aria-label="Filter by strand" className="flex flex-wrap gap-1.5">
            {[{ id: null, code: "All" }, { id: "core", code: "Core (all strands)" }, ...strands].map((s) => (
              <Link
                key={s.code}
                href={flowHref("/subjects", { ...flow, strand: s.id })}
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
        <SubjectsList
          heading={heading}
          context={context}
          showStrand={flow.level === "SENIOR_HIGH"}
          strands={strands.map((s) => ({ value: s.id, label: `${s.code} — ${s.name}` }))}
          subjects={subjects.map((s) => ({
            id: s.id,
            code: s.code,
            name: s.name,
            description: s.description ?? "",
            units: s.units,
            lectureHours: s.lectureHours,
            labHours: s.labHours,
            requiredRoomType: s.requiredRoomType,
            level: s.level,
            programId: s.programId ?? "",
            strand: s.program?.code ?? null,
            yearLevel: s.yearLevel ?? "",
            gradeLevel: s.gradeLevel ?? "",
            classes: s._count.schedules,
          }))}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Subjects" description="Pick a level and year or grade to manage its subjects, units, and weekly hours." />
      <LevelFlow
        basePath="/subjects"
        rootLabel="Subjects"
        noun="subjects"
        flow={flow}
        rows={all}
        programs={programs}
        allowGeneral
        allowAnyYear
      />
      {list}
    </div>
  );
}
