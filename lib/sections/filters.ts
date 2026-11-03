export const SECTION_SEMESTERS = ["1", "2", "MIDYEAR"] as const;
export const SECTION_STATUSES = ["ACTIVE", "ARCHIVED"] as const;

export function parseSectionFilters(params: Record<string, string | string[] | undefined>, defaults: { year: string; semester: string; years?: string[] }) {
  const one = (value: string | string[] | undefined) => typeof value === "string" ? value : undefined;
  const semester = one(params.semester);
  const status = one(params.status);
  return {
    year: !defaults.years || defaults.years.includes(one(params.year) ?? "") ? (one(params.year) ?? defaults.year) : defaults.year,
    semester: (SECTION_SEMESTERS as readonly string[]).includes(semester ?? "") ? semester! : defaults.semester,
    status: (SECTION_STATUSES as readonly string[]).includes(status ?? "") ? status! : "ACTIVE",
    level: one(params.level), program: one(params.program), yearLevel: one(params.yearLevel),
  };
}

export function semesterType(value: string) { return value === "1" ? "FIRST" : value === "2" ? "SECOND" : "SUMMER"; }
