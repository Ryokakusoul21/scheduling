export const SUBJECT_CATEGORIES = ["ALL", "MAJOR", "MINOR", "JOINED"] as const;
export const SUBJECT_SEMESTERS = ["1", "2", "MIDYEAR"] as const;
export const SUBJECT_OWNERS = ["ME", "ALL"] as const;
export type SubjectCategoryFilter = (typeof SUBJECT_CATEGORIES)[number];
export type SubjectSemesterFilter = (typeof SUBJECT_SEMESTERS)[number] | null;
export type SubjectOwnerFilter = (typeof SUBJECT_OWNERS)[number];

export type FilterableSubject = {
  category: "MAJOR" | "MINOR";
  semester: string | null;
  departmentId: string | null;
  sharedProgramIds: string[];
};

export function parseSubjectFilters(params: Record<string, string | string[] | undefined>, headOfDepartment: boolean) {
  void headOfDepartment;
  const one = (value: string | string[] | undefined) => typeof value === "string" ? value : undefined;
  const category = one(params.category);
  const semester = one(params.semester);
  const owner = one(params.owner);
  return {
    category: (SUBJECT_CATEGORIES as readonly string[]).includes(category ?? "") ? category as SubjectCategoryFilter : "ALL",
    semester: (SUBJECT_SEMESTERS as readonly string[]).includes(semester ?? "") ? semester as SubjectSemesterFilter : null,
    owner: (SUBJECT_OWNERS as readonly string[]).includes(owner ?? "") ? owner as SubjectOwnerFilter : "ALL",
    program: one(params.program),
    year: one(params.year),
  };
}

export function filterSubjects<T extends FilterableSubject>(rows: T[], filters: { category: SubjectCategoryFilter; semester: SubjectSemesterFilter; owner: SubjectOwnerFilter }, departmentId: string | null) {
  const term = filters.semester === "1" ? "FIRST" : filters.semester === "2" ? "SECOND" : filters.semester === "MIDYEAR" ? "SUMMER" : null;
  return rows.filter((row) =>
    (filters.category === "ALL" || (filters.category === "JOINED" ? row.sharedProgramIds.length > 1 : row.category === filters.category)) &&
    (!term || row.semester === term) &&
    (filters.owner === "ALL" || (!!departmentId && row.departmentId === departmentId))
  );
}
