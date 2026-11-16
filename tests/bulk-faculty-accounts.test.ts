import { describe, expect, it, vi } from "vitest";
import type { FacultyAccountRecord } from "@/lib/admin/faculty-alignment";

vi.mock("@/app/(dashboard)/admin/users/actions", () => ({ createFacultyAccountsBulkAction: vi.fn() }));
import { checkRows } from "@/app/(dashboard)/admin/users/bulk-accounts";

const base = { email: "x@school.edu", status: "ACTIVE", departmentId: null, departmentName: null, account: null };
const roster: FacultyAccountRecord[] = [
  { ...base, id: "a", fullName: "Ana", employeeId: "GC-1" },
  { ...base, id: "b", fullName: "Ben", employeeId: "GC-2" },
  { ...base, id: "d", fullName: "Dee", employeeId: "GC-4", departmentId: "educ" },
  { ...base, id: "c", fullName: "Cy", employeeId: "GC-3", account: { id: "u", name: "Cy", email: "cy@gmail.com", role: "FACULTY", status: "ACTIVE", archived: false } },
];

describe("bulk faculty account rows", () => {
  it("skips the header and accepts valid rows with default role", () => {
    const rows = checkRows("Employee ID,Gmail,Role\nGC-1,Ana@Gmail.com,\nGC-2,ben@gmail.com,Head of Department", roster);
    expect(rows.map((r) => [r.email, r.role, r.issue])).toEqual([["ana@gmail.com", "FACULTY", undefined], ["ben@gmail.com", "HEAD_OF_DEPARTMENT", undefined]]);
  });
  it("flags unknown, existing, invalid, and duplicate rows", () => {
    const rows = checkRows("GC-9,a@gmail.com\nGC-3,c@gmail.com\nGC-1,bad\nGC-2,d@gmail.com\nGC-2,e@gmail.com", roster);
    expect(rows.map((r) => r.issue)).toEqual(["Not on roster", "Already has an account", "Invalid email", undefined, "Duplicate employee ID"]);
  });
  it("flags faculty from another department when one is chosen", () => {
    const rows = checkRows("GC-1,a@gmail.com\nGC-4,d@gmail.com", roster, "educ");
    expect(rows.map((r) => r.issue)).toEqual(["Other department", undefined]);
  });
});
