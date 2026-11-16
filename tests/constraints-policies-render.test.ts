import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ClassPolicyFields, PolicySettingsFields, PolicyTargetFields } from "@/app/(dashboard)/constraints/class-policy-fields";
import { DEFAULT_PARAMS, categoryOf, settingChips } from "@/app/(dashboard)/constraints/categories";
import { PolicyReview, PolicyWizard } from "@/app/(dashboard)/constraints/policy-wizard";
import { policyOptionsFixture } from "./fixtures/policy-options";
vi.mock("@/app/(dashboard)/constraints/actions", () => ({ previewConstraintAction: vi.fn(), saveConstraintAction: vi.fn() }));
vi.mock("@/components/ui/dialog", () => {
  const component = ({ children, className }: { children?: import("react").ReactNode; className?: string }) => createElement("div", { className }, children);
  return Object.fromEntries(["Dialog", "DialogContent", "DialogDescription", "DialogFooter", "DialogHeader", "DialogTitle"].map((name) => [name, component]));
});

describe("Scheduling Constraints policy editor", () => {
  it("presents a wider three-step editor with a fixed managed department and relevant active terms", () => {
    const options = policyOptionsFixture(); options.departments = options.departments!.filter((d) => d.value === "cs");
    const html = renderToStaticMarkup(createElement(PolicyWizard, { row: null, initialKind: "DELIVERY_MODE", initialParams: DEFAULT_PARAMS.DELIVERY_MODE, initialName: "Class delivery mode", options, isAdmin: false, onClose: () => {}, onOtherRules: () => {} }));
    for (const label of ["Create scheduling rule", "Step 1 of 3", "Target", "Review", "College of Informatics and Computing Sciences", "Academic year", "First Semester", "In person", "Live online", "Allow both", "Continue"]) expect(html).toContain(label);
    expect(html).toContain("sm:max-w-4xl");
    expect(html).not.toContain("First Quarter");
    expect(html).toMatch(/value="year"[^>]*selected/);
    expect(html).not.toMatch(/value="old-year"[^>]*selected/);
    expect(html).not.toContain('aria-label="Managed department"');
  });

  it("hides unrelated grade and level fields for a college department", () => {
    const html = renderToStaticMarkup(createElement(ClassPolicyFields, { kind: "DELIVERY_MODE", params: DEFAULT_PARAMS.DELIVERY_MODE, set: () => {}, options: policyOptionsFixture(), departmentId: "cs" }));
    expect(html).toContain("All department classes");
    expect(html).toContain("Minor or major subjects");
    expect(html).toContain('id="policy-yearLevel"');
    expect(html).not.toContain('id="policy-gradeLevel"');
    expect(html).not.toContain('value="stem"');
    expect(html).not.toContain('id="policy-classId"');
  });

  it("only reveals selected-section controls for that target type", () => {
    const html = renderToStaticMarkup(createElement(PolicyTargetFields, { params: { ...DEFAULT_PARAMS.DELIVERY_MODE, target: { termId: "term", sectionIds: ["section"] } }, set: () => {}, options: policyOptionsFixture(), departmentId: "cs", academicYearId: "year", targetType: "SECTION", onTargetTypeChange: () => {} }));
    expect(html).toContain("Select sections"); expect(html).toContain("BSIT 1A"); expect(html).toContain("BSIT 1B");
    expect(html).not.toContain("STEM 11A"); expect(html).not.toContain("BSIT 2A");
    expect(html).not.toContain('id="policy-subjectId"');
  });

  it("uses duration presets and an optional final remainder without duplicating curriculum hours", () => {
    const html = renderToStaticMarkup(createElement(PolicySettingsFields, { kind: "CLASS_DURATION", params: DEFAULT_PARAMS.CLASS_DURATION, set: () => {} }));
    for (const text of ["Allowed meeting lengths", "1 hour", "1.5 hours", "Custom length (hours)", "Allow a shorter final meeting", "Weekly lecture and laboratory requirements continue to come from the curriculum."]) expect(html).toContain(text);
  });

  it("shows review counts and a summary before creating the rule", () => {
    const html = renderToStaticMarkup(createElement(PolicyReview, { name: "Minor subjects online", departmentName: "COICS", period: "2026-2027 - First Semester", chips: ["Minor subjects", "First Year", "Live online"], preview: { ok: true, token: "preview", matching: 2, affected: 1, published: 0 }, pending: false, matchingMeetings: policyOptionsFixture().classes.slice(0, 2) }));
    for (const text of ["Minor subjects online", "COICS", "First Semester", "Matching meetings", "Need review", "Existing times and delivery modes stay unchanged.", "BSIT 1A"]) expect(html).toContain(text);
  });

  it("keeps both policy types in Schedule rules and displays multiple-section target chips", () => {
    expect(categoryOf("DELIVERY_MODE", {})).toBe("schedule"); expect(categoryOf("CLASS_DURATION", {})).toBe("schedule");
    const chips = settingChips("DELIVERY_MODE", { ...DEFAULT_PARAMS.DELIVERY_MODE, target: { yearLevel: "FIRST", subjectCategory: "MINOR", sectionIds: ["section", "section-b"] } }, new Map([["section", "BSIT 1A"], ["section-b", "BSIT 1B"]]));
    expect(chips).toContain("First Year"); expect(chips).toContain("Minor subjects"); expect(chips).toContain("BSIT 1A"); expect(chips).toContain("BSIT 1B");
  });
});
