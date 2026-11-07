import { prisma } from "@/lib/db/prisma";
import { ACADEMIC_LEVELS, levelLabel, termLabel } from "@/lib/academics/levels";
import { dashboardAnalytics } from "@/lib/analytics/dashboard";
import { CardGrid } from "@/components/ux/card-grid";
import { LEVEL_ACCENTS, LEVEL_ICONS } from "@/components/ux/level-icons";
import { SelectCard } from "@/components/ux/states";
import { AdminAnalytics } from "./admin-analytics";

/** Sections, subjects, and timetable coverage per academic level in the active terms. */
async function LevelCards() {
  const termIds = (await prisma.semester.findMany({ where: { isActive: true }, select: { id: true } })).map((t) => t.id);
  const [sectionsByLevel, subjectsByLevel, activeClasses] = await Promise.all([
    prisma.section.groupBy({ by: ["level"], _count: true }),
    prisma.subject.groupBy({ by: ["level"], _count: true }),
    prisma.schedule.findMany({ where: { semesterId: { in: termIds }, status: { not: "ARCHIVED" } }, select: { sectionId: true, section: { select: { level: true } } } }),
  ]);
  const countFor = (rows: { level: string; _count: number }[], level: string) => rows.find((r) => r.level === level)?._count ?? 0;

  return (
    <section aria-labelledby="lv-title" className="space-y-2">
      <h2 id="lv-title" className="text-sm font-semibold text-muted-foreground">
        By academic level (active terms)
      </h2>
      <CardGrid label="Academic levels" className="sm:grid-cols-2 xl:grid-cols-4">
        {ACADEMIC_LEVELS.map((l) => {
          const sections = countFor(sectionsByLevel, l);
          const classes = activeClasses.filter((c) => c.section.level === l);
          const covered = new Set(classes.map((c) => c.sectionId)).size;
          const pct = sections ? Math.round((covered / sections) * 100) : 0;
          return (
            <SelectCard
              key={l}
              href={`/scheduler?level=${l}`}
              icon={LEVEL_ICONS[l]}
              accent={LEVEL_ACCENTS[l]}
              title={levelLabel(l)}
              subtitle={`${sections} sections · ${countFor(subjectsByLevel, l)} subjects · ${classes.length} classes`}
            >
              <div className="mt-3">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Sections with a timetable</span>
                  <span>
                    {covered}/{sections}
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                  <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                </div>
              </div>
            </SelectCard>
          );
        })}
      </CardGrid>
    </section>
  );
}

/**
 * School-wide Registrar analytics shown on the Analytics page. Filters live in the address
 * (semester, department, building); LiveRefresh re-renders everything when schedules change.
 */
export async function AdminPanels({ params }: { params: { term?: string; department?: string; building?: string } }) {
  const [terms, departments, buildings] = await Promise.all([
    prisma.semester.findMany({ include: { academicYear: { select: { name: true } } }, orderBy: [{ startDate: "desc" }, { level: "asc" }] }),
    prisma.department.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.building.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } }),
  ]);
  const term =
    terms.find((t) => t.id === params.term) ?? terms.find((t) => t.isActive && t.level === "COLLEGE") ?? terms.find((t) => t.isActive) ?? terms[0];
  if (!term) return null;
  const departmentId = departments.some((d) => d.id === params.department) ? params.department! : null;
  const buildingId = buildings.some((b) => b.id === params.building) ? params.building! : null;

  const data = await dashboardAnalytics({ termId: term.id, departmentId, buildingId });

  return (
    <AdminAnalytics
      data={data}
      levels={<LevelCards />}
      filters={{
        term: term.id,
        department: departmentId ?? "",
        building: buildingId ?? "",
        terms: terms.map((t) => ({ value: t.id, label: `${levelLabel(t.level)} · ${termLabel(t.type)} ${t.academicYear.name}${t.isActive ? " (active)" : ""}` })),
        departments: departments.map((d) => ({ value: d.id, label: d.name })),
        buildings: buildings.map((b) => ({ value: b.id, label: b.name })),
      }}
    />
  );
}
