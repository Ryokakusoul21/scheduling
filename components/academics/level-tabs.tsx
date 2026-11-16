import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { ACADEMIC_LEVELS, LEVELS, type AcademicLevel } from "@/lib/academics/levels";
import { cn } from "@/lib/utils";
import { LevelSelect } from "./level-select";

/** Level to show when none is chosen; levels are never combined. */
export const DEFAULT_LEVEL: AcademicLevel = "COLLEGE";

const FLOW_KEYS = ["level", "program", "year", "grade", "strand", "yearLevel"];

/**
 * One tab per academic level, so a list never mixes levels. Other filters
 * (term, status, department) are kept; the level's own drill-down is reset.
 */
export function LevelTabs({ basePath, active, params, counts, noun, mobileSelect = false }: {
  basePath: string;
  active: AcademicLevel;
  params: Record<string, string | undefined>;
  counts?: Partial<Record<AcademicLevel, number>>;
  noun?: string;
  mobileSelect?: boolean;
}) {
  const href = (level: AcademicLevel) => {
    const next = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => value && !FLOW_KEYS.includes(key) && next.set(key, value));
    next.set("level", level);
    return `${basePath}?${next}`;
  };
  return (
    <>
    {mobileSelect && <LevelSelect value={href(active)} options={ACADEMIC_LEVELS.map((level) => ({ value: href(level), label: `${LEVELS[level].label}${counts && counts[level] !== undefined ? ` · ${counts[level]} ${noun ?? "records"}` : ""}` }))} />}
    <nav aria-label="Academic level" className={cn("flex gap-1 overflow-x-auto rounded-xl border bg-card p-1 print:hidden", mobileSelect && "hidden md:flex")}>
      {ACADEMIC_LEVELS.map((level) => (
        <Link
          key={level}
          href={href(level)}
          title={LEVELS[level].description}
          aria-current={level === active ? "page" : undefined}
          className={cn(
            "inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
            level === active && "bg-primary text-primary-foreground hover:bg-primary/90"
          )}
        >
          {LEVELS[level].label}
          {counts && <Badge variant={level === active ? "outline" : "secondary"} aria-label={`${counts[level] ?? 0} ${noun ?? "records"}`}>{counts[level] ?? 0}</Badge>}
        </Link>
      ))}
    </nav>
    </>
  );
}
