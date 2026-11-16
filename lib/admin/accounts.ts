export interface AccountListRow {
  id: string; name: string; email: string; role: string; status: string; facultyId: string | null;
  departmentIds: string[]; departmentNames: string[]; facultyLabel: string | null;
  createdAt: string; lastLoginAt: string | null; emailVerified: boolean; twoFactorEnabled: boolean;
  facultyArchived?: boolean;
  facultyStatus?: string | null;
  facultyDepartmentName?: string | null;
  facultyContactEmail?: string | null;
}

export const needsFacultyLinkReview = (user: AccountListRow) => ["FACULTY", "HEAD_OF_DEPARTMENT"].includes(user.role) && (!user.facultyId || !!user.facultyArchived);

export function accountSummary(users: readonly AccountListRow[]) {
  return {
    total: users.length, active: users.filter((user) => user.status === "ACTIVE").length,
    pending: users.filter((user) => user.status === "PENDING").length,
    restricted: users.filter((user) => ["INACTIVE", "SUSPENDED"].includes(user.status)).length,
    unlinked: users.filter((user) => ["FACULTY", "HEAD_OF_DEPARTMENT"].includes(user.role) && !user.facultyId).length,
    archivedFacultyLinks: users.filter((user) => ["FACULTY", "HEAD_OF_DEPARTMENT"].includes(user.role) && user.facultyArchived).length,
  };
}

export function filterAccounts<T extends AccountListRow>(users: readonly T[], filters: { query: string; role: string; status: string; department: string; unlinked: boolean }) {
  const query = filters.query.trim().toLowerCase();
  return users.filter((user) =>
    (filters.role === "ALL" || user.role === filters.role) &&
    (filters.status === "ALL" || (filters.status === "RESTRICTED" ? ["INACTIVE", "SUSPENDED"].includes(user.status) : user.status === filters.status)) &&
    (filters.department === "ALL" || (filters.department === "UNASSIGNED" ? !user.departmentIds.length : user.departmentIds.includes(filters.department))) &&
    (!filters.unlinked || needsFacultyLinkReview(user)) &&
    (!query || [user.name, user.email, user.facultyLabel ?? "", ...user.departmentNames].some((value) => value.toLowerCase().includes(query))),
  );
}
