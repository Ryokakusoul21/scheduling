import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ role: "REGISTRAR", findMany: vi.fn(), count: vi.fn() }));
vi.mock("@/lib/permissions/scope", () => ({ requireScope: async (...roles: string[]) => {
  if (!roles.includes(m.role)) throw new Error("FORBIDDEN");
  return { userId: "user", role: m.role, isAdmin: m.role === "REGISTRAR" || m.role === "SUPER_ADMINISTRATOR", departmentIds: ["own"] };
} }));
vi.mock("@/lib/db/prisma", () => ({ prisma: {
  department: { findMany: m.findMany }, timetableSubmission: { findMany: m.findMany }, roomBooking: { findMany: m.findMany }, unavailability: { findMany: m.findMany },
  subjectAssignmentProposal: { count: m.count },
} }));
vi.mock("@/lib/scheduler/submissions", () => ({ LOCKED_STATUSES: ["SUBMITTED", "APPROVED"], SUBMISSION_LABEL: {}, submissionTitle: vi.fn() }));
vi.mock("@/app/(dashboard)/assignment-approvals/assignment-approvals-section", () => ({
  AssignmentApprovalsSection: ({ scope, embedded }: { scope: { role: string }; embedded?: boolean }) => createElement("section", { "data-role": scope.role, "data-embedded": embedded }, "Subject assignment workspace"),
}));
vi.mock("@/app/(dashboard)/admin/review-center/review-inbox", () => ({ ReviewInbox: () => createElement("div", null, "Timetable review inbox") }));
vi.mock("next/navigation", () => ({ redirect: (href: string) => { throw new Error(`REDIRECT:${href}`); } }));

import ReviewCenterPage from "@/app/(dashboard)/admin/review-center/page";
import AssignmentApprovalsPage from "@/app/(dashboard)/assignment-approvals/page";
import { buildBreadcrumbs } from "@/lib/navigation/breadcrumbs";

describe("subject assignments in Submission Monitoring", () => {
  beforeEach(() => { vi.clearAllMocks(); m.role = "REGISTRAR"; m.findMany.mockResolvedValue([]); m.count.mockResolvedValue(4); });

  it.each(["SUPER_ADMINISTRATOR", "REGISTRAR"])("opens the existing assignment review workspace for %s", async (role) => {
    m.role = role;
    const html = renderToStaticMarkup(await ReviewCenterPage({ searchParams: Promise.resolve({ queue: "subject-assignments" }) }));
    expect(html).toContain("Submission Monitoring");
    expect(html).toContain("Subject Assignment Approvals");
    expect(html).toContain("Subject assignment workspace");
    expect(html).toContain(`data-role="${role}"`);
    expect(html).toContain('data-embedded="true"');
    expect(html).toContain('href="/admin/review-center?queue=subject-assignments"');
    expect(html).not.toContain("Timetable review inbox");
    expect(html).not.toContain("Apply filters");
    expect(m.count).toHaveBeenCalledWith({ where: { status: "PENDING" } });
  });

  it.each(["SUPER_ADMINISTRATOR", "REGISTRAR"])("redirects legacy assignment links to the monitoring queue for %s", async (role) => {
    m.role = role;
    await expect(AssignmentApprovalsPage()).rejects.toThrow("REDIRECT:/admin/review-center?queue=subject-assignments");
    expect(m.findMany).not.toHaveBeenCalled();
  });

  it("keeps the Head's original department approval route and denies access to the admin queue", async () => {
    m.role = "HEAD_OF_DEPARTMENT";
    const result = await AssignmentApprovalsPage();
    expect(result.props.scope.role).toBe("HEAD_OF_DEPARTMENT");
    expect(result.props.embedded).toBeUndefined();
    await expect(ReviewCenterPage({ searchParams: Promise.resolve({ queue: "subject-assignments" }) })).rejects.toThrow("FORBIDDEN");
  });

  it("continues to render the timetable inbox for the existing queues", async () => {
    const html = renderToStaticMarkup(await ReviewCenterPage({ searchParams: Promise.resolve({}) }));
    expect(html).toContain("Timetable review inbox");
    expect(html).toContain("Subject Assignment Approvals");
    expect(html).not.toContain("Subject assignment workspace");
  });

  it("names the new queue in breadcrumbs", () => {
    expect(buildBreadcrumbs("/admin/review-center", new URLSearchParams("queue=subject-assignments"), "SUPER_ADMINISTRATOR").map((item) => item.label))
      .toEqual(["Dashboard", "Submission Monitoring", "Subject Assignment Approvals"]);
  });
});
