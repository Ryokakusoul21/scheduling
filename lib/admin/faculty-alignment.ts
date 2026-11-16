export type FacultyAccountRecord = {
  id: string; fullName: string; employeeId: string; email: string; status: string;
  departmentId: string | null; departmentName: string | null;
  account: { id: string; name: string; email: string; role: string; status: string; archived: boolean; emailVerified?: boolean } | null;
};

export function facultyContactPending(email: string) {
  return email.trim().toLowerCase().endsWith(".invalid");
}

export function facultyAccountSummary(rows: FacultyAccountRecord[]) {
  return { total: rows.length, linked: rows.filter((r) => r.account && !r.account.archived).length,
    missing: rows.filter((r) => !r.account).length, archivedAccounts: rows.filter((r) => r.account?.archived).length,
    contactPending: rows.filter((r) => facultyContactPending(r.email)).length };
}
