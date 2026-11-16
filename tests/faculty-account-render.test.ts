import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { FacultyAccountRecord } from "@/lib/admin/faculty-alignment";

vi.mock("@/app/(dashboard)/admin/users/actions", () => ({ createFacultyAccountAction: vi.fn(), resetPasswordAction: vi.fn(), changeEmailAction: vi.fn(), setAccountStatusAction: vi.fn() }));
import { FacultyAccountAlignment } from "@/app/(dashboard)/admin/users/faculty-account-alignment";

const profile: FacultyAccountRecord = { id: "faculty", fullName: "Registrar Name", employeeId: "GC-300001", email: "faculty@school.edu", status: "INACTIVE", departmentId: "coics", departmentName: "Computing Sciences", account: null };
const render = (faculty: FacultyAccountRecord[]) => renderToStaticMarkup(createElement(FacultyAccountAlignment, { faculty, onReview: vi.fn() }));

describe("Faculty roster as the user list", () => {
  it("offers account creation for faculty without a login", () => {
    const html = render([profile]);
    expect(html).toContain("Registrar Name"); expect(html).toContain("GC-300001"); expect(html).toContain("Computing Sciences");
    expect(html).toContain("No account"); expect(html).toContain("Create account");
  });
  it("shows the login email and status once an account exists", () => {
    const html = render([{ ...profile, account: { id: "u", name: profile.fullName, email: "login@gmail.com", role: "FACULTY", status: "ACTIVE", archived: false } }]);
    expect(html).toContain("login@gmail.com"); expect(html).toContain("Active");
    expect(html).not.toContain("Create account");
  });
  it("links archived accounts to the archive instead of offering a duplicate", () => {
    const html = render([{ ...profile, account: { id: "u", name: profile.fullName, email: "login@gmail.com", role: "FACULTY", status: "ACTIVE", archived: true } }]);
    expect(html).toContain("/admin/users/archived");
    expect(html).not.toContain("Create account");
  });
});
