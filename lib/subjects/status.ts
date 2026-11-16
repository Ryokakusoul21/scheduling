export const STATUS_FILTERS = ["ALL", "ASSIGNED", "UNASSIGNED", "ATTENTION", "REQUEST"] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];

export const STATUS_LABELS: Record<StatusFilter, string> = {
  ALL: "All statuses",
  ASSIGNED: "Assigned",
  UNASSIGNED: "Unassigned",
  ATTENTION: "Needs attention",
  REQUEST: "Request pending",
};

export type StatusRow = { assignments: { facultyId: string; sectionId?: string | null }[]; eligibleSectionIds?: string[]; request: { status: string } | null };
export type PersonLoad = { load: number; limit: number; unavailability: string[] };

export function offeringCoverage(row: Pick<StatusRow, "assignments" | "eligibleSectionIds">) {
  if (!row.eligibleSectionIds) return { total: Math.max(1, row.assignments.length), assigned: row.assignments.length };
  const ids = new Set(row.assignments.map((a) => a.sectionId));
  return { total: row.eligibleSectionIds.length, assigned: row.eligibleSectionIds.filter((id) => ids.has(id)).length };
}

/** Why a subject needs a second look, or null: nobody teaches it, or a teacher is at their limit or reported unavailable. */
export function attentionReason(row: StatusRow, people: ReadonlyMap<string, PersonLoad>) {
  const coverage = offeringCoverage(row);
  if (!coverage.total) return "No matching sections for this term";
  if (!row.assignments.length) return "Nobody is assigned";
  if (coverage.assigned < coverage.total) return `${coverage.total - coverage.assigned} of ${coverage.total} sections still need a teacher`;
  for (const a of row.assignments) {
    const p = people.get(a.facultyId);
    if (p && p.limit > 0 && p.load >= p.limit) return "A teacher is at or over their maximum load";
    if (p && p.unavailability.length) return "A teacher reported unavailability this term";
  }
  return null;
}

export function matchesStatus(filter: StatusFilter, row: StatusRow, people: ReadonlyMap<string, PersonLoad>) {
  switch (filter) {
    case "ASSIGNED": { const c = offeringCoverage(row); return c.total > 0 && c.assigned === c.total; }
    case "UNASSIGNED": { const c = offeringCoverage(row); return c.assigned < c.total; }
    case "ATTENTION": return attentionReason(row, people) !== null;
    case "REQUEST": return row.request?.status === "PENDING";
    default: return true;
  }
}

const cell = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;

/** Spreadsheet-friendly CSV (quotes doubled) of the rows a person selected. */
export function toCsv(header: string[], rows: (string | number)[][]) {
  return [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
}
