export interface DepartmentHeadRecord {
  id: string;
  name: string;
  faculty: { departmentId: string | null } | null;
  departmentAssignments: { departmentId: string; startsAt: Date | null; endsAt: Date | null }[];
}

export class DepartmentHeadConflictError extends Error {
  constructor(headName: string) {
    super(`${headName} already heads this department during that period. Only one active Head of Department is allowed. Remove or end the existing authority before assigning another head.`);
    this.name = "DepartmentHeadConflictError";
  }
}

/** Faculty links grant permanent authority; direct and acting assignments grant authority for their full date range. */
function authorityPeriods(head: DepartmentHeadRecord, now: Date) {
  const periods = head.departmentAssignments
    .filter((assignment) => !assignment.endsAt || assignment.endsAt >= now)
    .map((assignment) => ({
      departmentId: assignment.departmentId,
      start: Math.max(now.getTime(), assignment.startsAt?.getTime() ?? -Infinity),
      end: assignment.endsAt?.getTime() ?? Infinity,
    }));
  if (head.faculty?.departmentId) periods.push({ departmentId: head.faculty.departmentId, start: now.getTime(), end: Infinity });
  return periods.filter((period) => period.start <= period.end);
}

/** Returns another active account with overlapping authority, including future assignments. */
export function conflictingDepartmentHead(heads: readonly DepartmentHeadRecord[], userId: string, now = new Date()) {
  const candidate = heads.find((head) => head.id === userId);
  if (!candidate) return undefined;
  const periods = authorityPeriods(candidate, now);
  return heads.find((head) => head.id !== userId && authorityPeriods(head, now).some((other) =>
    periods.some((period) => period.departmentId === other.departmentId && period.start <= other.end && other.start <= period.end),
  ));
}
