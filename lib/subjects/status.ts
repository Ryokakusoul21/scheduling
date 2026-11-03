export const STATUS_FILTERS = ["ALL", "ASSIGNED", "UNASSIGNED", "ATTENTION", "REQUEST"] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];

export const STATUS_LABELS: Record<StatusFilter, string> = {
  ALL: "All statuses",
  ASSIGNED: "Assigned",
  UNASSIGNED: "Unassigned",
  ATTENTION: "Needs attention",
  REQUEST: "Request pending",
};

export type StatusRow = { assignments: { facultyId: string }[]; request: { status: string } | null };
export type PersonLoad = { load: number; limit: number; unavailability: string[] };

/** Why a subject needs a second look, or null: nobody teaches it, or a teacher is at their limit or reported unavailable. */
export function attentionReason(row: StatusRow, people: ReadonlyMap<string, PersonLoad>) {
  if (!row.assignments.length) return "Nobody is assigned";
  for (const a of row.assignments) {
    const p = people.get(a.facultyId);
    if (p && p.limit > 0 && p.load >= p.limit) return "A teacher is at or over their maximum load";
    if (p && p.unavailability.length) return "A teacher reported unavailability this term";
  }
  return null;
}

export function matchesStatus(filter: StatusFilter, row: StatusRow, people: ReadonlyMap<string, PersonLoad>) {
  switch (filter) {
    case "ASSIGNED": return row.assignments.length > 0;
    case "UNASSIGNED": return row.assignments.length === 0;
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
