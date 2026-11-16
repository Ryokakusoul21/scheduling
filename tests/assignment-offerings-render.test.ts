import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { AssignContext, SubjectInfo } from "@/app/(dashboard)/subjects/types";

vi.mock("@/components/ui/dialog", () => {
  const Wrap = ({ children }: { children: ReactNode }) => createElement("div", null, children);
  return { Dialog: Wrap, DialogContent: Wrap, DialogDescription: Wrap, DialogFooter: Wrap, DialogHeader: Wrap, DialogTitle: Wrap };
});
vi.mock("@/app/(dashboard)/subjects/assignment-actions", () => ({ assignmentConflictsAction: vi.fn(), saveAssignmentPlanAction: vi.fn(), subjectDetailsAction: vi.fn() }));
vi.mock("@/app/(dashboard)/subjects/assignment-proposal-actions", () => ({ createAssignmentProposalsAction: vi.fn() }));
import { AssignFacultyModal } from "@/app/(dashboard)/subjects/assign-faculty-modal";

const sections = Array.from({ length: 8 }, (_, i) => ({ id: `s${i}`, name: `BSIT 1-${i}` }));
const subject: SubjectInfo = { id: "cc101", code: "CC101", name: "Computing", description: "", units: 3, lectureHours: 3, labHours: 0, departmentId: "cs", departmentName: "Computing", assignments: sections.map((s) => ({ id: `a-${s.id}`, sectionId: s.id, sectionName: s.name, facultyId: "ana", facultyName: "Ana Santos" })), progress: [{ sectionId: "s0", scheduledHours: 1.5 }] };
const context: AssignContext = { sections, measure: "HOURS", term: { id: "t1", label: "First Semester" }, terms: [], faculty: [{ id: "ana", name: "Ana Santos", email: "ana@test", employeeId: "F1", departmentId: "cs", departmentName: "Computing", specialization: null, employmentType: "FULL_TIME", load: 24, minimum: 0, limit: 24, unavailability: [] }] };
describe("section assignment dialog", () => {
  it("shows actual sections, their teacher and progress, and the complete current workload", () => {
    const html = renderToStaticMarkup(createElement(AssignFacultyModal, { subjects: [subject], context, onClose: vi.fn() }));
    expect(html).toContain("Select all matching sections (8)");
    expect(html).not.toContain("All sections");
    expect(html).not.toContain("checked=\"\"");
    for (const section of sections) expect(html).toContain(section.name);
    expect(html).toContain("Workload 24 of 24 hrs");
    expect(html).toContain("1.5 scheduled");
    expect(html).toContain("1.5 remaining");
  });
  it("restricts bulk selection to sections eligible for every selected subject", () => {
    const html = renderToStaticMarkup(createElement(AssignFacultyModal, { subjects: [{ ...subject, assignments: [], eligibleSectionIds: ["s0"] }], context, onClose: vi.fn() }));
    expect(html).toContain("Select all matching sections (1)");
    expect(html).toContain(sections[0].name);
    expect(html).not.toContain(sections[1].name);
  });
  it("explains direct and external approval outcomes and hides inactive temporary profiles", () => {
    const scoped = { ...context, assignmentScope: { departmentIds: ["cs"], inactiveFacultyCount: 16 }, faculty: [...context.faculty, { ...context.faculty[0], id: "external", name: "GE Teacher", departmentId: "gened" }] };
    const html = renderToStaticMarkup(createElement(AssignFacultyModal, { subjects: [subject], context: scoped, onClose: vi.fn() }));
    expect(html).toContain("Assign directly");
    expect(html).toContain("Requires department approval");
    expect(html).toContain("16 inactive faculty profiles");
    expect(html).toContain("activate them in Faculty first");
  });
  it("shows pending approvals while keeping the current teacher and excluding the section from new bulk changes", () => {
    const html = renderToStaticMarkup(createElement(AssignFacultyModal, { subjects: [{ ...subject, pendingApprovals: [{ sectionId: "s0", facultyName: "Proposed Teacher", departmentName: "General Education" }] }], context, onClose: vi.fn() }));
    expect(html).toContain("Select all matching sections (7)");
    expect(html).toContain("Pending approval: Proposed Teacher");
    expect(html).toContain("The current teacher stays assigned until approval");
    expect(html).toContain("Ana Santos");
  });
});
