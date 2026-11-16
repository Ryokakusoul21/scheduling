import { Books, CalendarCheck, Stack } from "@phosphor-icons/react/ssr";
import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/ux/breadcrumbs";
import { CardGrid } from "@/components/ux/card-grid";
import { SelectCard } from "@/components/ux/states";
import { LEVEL_ACCENTS, LEVEL_ICONS } from "@/components/ux/level-icons";
import { ACADEMIC_LEVELS, LEVELS, YEAR_LEVELS, gradeLabel, yearLabel } from "@/lib/academics/levels";
import { ANY_YEAR, GENERAL, flowHref, isComplete, type Flow } from "@/lib/academics/flow";

interface Countable {
  level: string;
  programId: string | null;
  yearLevel: string | null;
  gradeLevel: string | null;
  sharedPrograms?: { id: string }[];
}

/**
 * Breadcrumbs plus the cards for the next step of the
 * Level → Program → Year / Level → Grade selection flow. Renders nothing but
 * the breadcrumbs once the flow is complete; the page then shows its list.
 */
export function LevelFlow({
  basePath,
  rootLabel,
  noun,
  flow,
  rows,
  programs,
  allowGeneral = false,
  allowAnyYear = false,
  queryParams,
}: {
  basePath: string;
  rootLabel: string;
  noun: string; // "subjects", "sections"
  flow: Flow;
  rows: Countable[];
  programs: { id: string; code: string; name: string; level: string }[];
  allowGeneral?: boolean;
  allowAnyYear?: boolean;
  queryParams?: Record<string, string>;
}) {
  const program = programs.find((p) => p.id === flow.programId);
  const href = (state: Partial<Flow>) => {
    const url = flowHref(basePath, state);
    const [path, query] = url.split("?");
    const params = new URLSearchParams(query);
    Object.entries(queryParams ?? {}).forEach(([key, value]) => params.set(key, value));
    return params.size ? `${path}?${params}` : path;
  };
  const crumbs = [{ label: rootLabel, href: href({}) }];
  if (flow.level) crumbs.push({ label: LEVELS[flow.level].label, href: href({ level: flow.level }) });
  if (flow.level === "COLLEGE" && flow.programId) {
    crumbs.push({
      label: flow.programId === GENERAL ? "General Education" : (program?.code ?? "Course"),
      href: href({ level: flow.level, programId: flow.programId }),
    });
  }
  if (flow.year) crumbs.push({ label: flow.year === ANY_YEAR ? "Any year" : yearLabel(flow.year), href: "" });
  if (flow.grade) crumbs.push({ label: gradeLabel(flow.grade), href: "" });

  const count = (pred: (r: Countable) => boolean) => rows.filter(pred).length;
  const badge = (n: number) => <Badge variant="secondary">{n} {n === 1 && noun.endsWith("s") ? noun.slice(0, -1) : noun}</Badge>;
  const inProgram = (row: Countable, id: string) => row.level === "COLLEGE" && (
    row.programId === id || row.sharedPrograms?.some((program) => program.id === id) || (!row.programId && row.sharedPrograms?.length === 0)
  );

  let step: React.ReactNode = null;
  if (!flow.level) {
    step = (
      <CardGrid label="Academic level" className="xl:grid-cols-4">
        {ACADEMIC_LEVELS.map((l) => (
          <SelectCard
            key={l}
            href={href({ level: l })}
            icon={LEVEL_ICONS[l]}
            accent={LEVEL_ACCENTS[l]}
            title={LEVELS[l].label}
            subtitle={LEVELS[l].description}
            meta={badge(count((r) => r.level === l))}
          />
        ))}
      </CardGrid>
    );
  } else if (flow.level === "COLLEGE" && !flow.programId) {
    const college = programs.filter((p) => p.level === "COLLEGE");
    step = (
      <CardGrid label="Course">
        {allowGeneral && (
          <SelectCard
            href={href({ level: "COLLEGE", programId: GENERAL })}
            icon={Books}
            title="General Education"
            subtitle="General Education and shared subject catalog"
            meta={badge(count((r) => r.level === "COLLEGE" && !r.programId))}
          />
        )}
        {college.map((p) => (
          <SelectCard
            key={p.id}
            href={href({ level: "COLLEGE", programId: p.id })}
            icon={Stack}
            title={p.code}
            subtitle={p.name}
            meta={badge(count((r) => inProgram(r, p.id)))}
          />
        ))}
      </CardGrid>
    );
  } else if (flow.level === "COLLEGE" && !flow.year) {
    const inSelectedProgram = (r: Countable) => r.level === "COLLEGE" && (flow.programId === GENERAL ? !r.programId : inProgram(r, flow.programId!));
    step = (
      <CardGrid label="Year level" className="xl:grid-cols-4">
        {YEAR_LEVELS.slice(0, 4).map((y) => (
          <SelectCard
            key={y}
            href={href({ ...flow, year: y })}
            icon={CalendarCheck}
            title={yearLabel(y)}
            meta={badge(count((r) => inSelectedProgram(r) && r.yearLevel === y))}
          />
        ))}
        {allowAnyYear && (
          <SelectCard
            href={href({ ...flow, year: ANY_YEAR })}
            icon={CalendarCheck}
            title="Any year"
            subtitle="Offered regardless of year level"
            meta={badge(count((r) => inSelectedProgram(r) && !r.yearLevel))}
          />
        )}
      </CardGrid>
    );
  } else if (!flow.grade && flow.level !== "COLLEGE") {
    const level = flow.level;
    step = (
      <CardGrid label="Grade level" className="xl:grid-cols-4">
        {LEVELS[level].grades.map((g) => (
          <SelectCard
            key={g}
            href={href({ level, grade: g })}
            icon={LEVEL_ICONS[level]}
            accent={LEVEL_ACCENTS[level]}
            title={gradeLabel(g)}
            meta={badge(count((r) => r.level === level && r.gradeLevel === g))}
          />
        ))}
      </CardGrid>
    );
  }

  return (
    <div className="space-y-4">
      <Breadcrumbs items={crumbs} />
      {!isComplete(flow) && step}
    </div>
  );
}
