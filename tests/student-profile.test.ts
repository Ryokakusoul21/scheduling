import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const mocks = vi.hoisted(() => ({ portal: vi.fn() }));
vi.mock("@/lib/student/portal", () => ({ loadStudentPortal: mocks.portal }));

import StudentProfilePage from "@/app/student/(portal)/profile/page";

const account = {
  user: { name: "Student Example", email: "student@example.invalid", image: null },
  studentNumber: "2026-001", term: "2026–2027 · First Semester",
  section: { name: "Information Technology 1-A", stage: "First Year", program: "BSIT - Information Technology" },
};

describe("student profile enrollment states", () => {
  beforeEach(() => vi.resetAllMocks());

  it("shows the signed-in student's college enrollment without editable academic fields", async () => {
    mocks.portal.mockResolvedValue(account);
    const html = renderToStaticMarkup(await StudentProfilePage());
    for (const detail of [account.user.name, account.user.email, account.studentNumber, account.section.program, account.term]) expect(html).toContain(detail);
    expect(html).toContain('href="/student/forgot-password"');
    expect(html).toContain('href="/student/schedule"');
    expect(html).not.toContain("<input");
    expect(html).not.toContain('href="/student/notifications"');
  });

  it("handles basic-education enrollment with no program or strand", async () => {
    mocks.portal.mockResolvedValue({ ...account, section: { name: "Grade 7 - Rizal", stage: "Grade 7", program: null } });
    const html = renderToStaticMarkup(await StudentProfilePage());
    expect(html).toContain("Grade 7 - Rizal");
    expect(html).toContain("Not applicable for your level");
    expect(html).not.toContain(account.section.program);
    expect(html).not.toContain("undefined");
  });

  it("keeps account details and recovery accessible when a section is missing", async () => {
    mocks.portal.mockResolvedValue({ ...account, section: null });
    const html = renderToStaticMarkup(await StudentProfilePage());
    expect(html).toContain(account.user.email);
    expect(html).toContain("Your section is not set yet");
    expect(html).toContain("Contact the Registrar");
    expect(html).toContain('href="/student/forgot-password"');
    expect(html).not.toContain('href="/student/schedule"');
  });
});
