import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AutoScheduleDialog } from "@/components/scheduler/auto-schedule-dialog";
import { UnscheduledPanel } from "@/components/scheduler/side-panels";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/(dashboard)/scheduler/auto-schedule-actions", () => ({ previewAutoScheduleAction: vi.fn(), applyAutoScheduleAction: vi.fn() }));
vi.mock("@/components/ui/dialog", () => {
  const Wrap = ({ children }: { children: ReactNode }) => createElement("div", null, children);
  return { Dialog: Wrap, DialogContent: Wrap, DialogDescription: Wrap, DialogFooter: Wrap, DialogHeader: Wrap, DialogTitle: Wrap };
});
vi.mock("@dnd-kit/core", () => ({ useDraggable: () => ({ setNodeRef: vi.fn(), listeners: {}, isDragging: false }) }));
const props = {
  selectedSectionId: "s1", filterSectionIds: ["s1", "s2"],
  labels: { section: (id: string) => id === "s1" ? "BSIT 1-A" : "BSIT 1-B", faculty: () => "Ana", subject: () => "CC101", room: () => "Room 1" },
  onPreview: vi.fn(), onApplied: vi.fn(), onClose: vi.fn(),
};
describe("Auto-Schedule UI", () => {
  it("offers explicit section and filter scopes and generates a preview before saving", () => {
    const html = renderToStaticMarkup(createElement(AutoScheduleDialog, props));
    expect(html).toContain("BSIT 1-A");
    expect(html).toContain("All sections");
    expect(html).toContain("Generate preview");
    expect(html).toContain("Existing meetings stay");
    expect(html).not.toContain("Save 0 draft");
  });
  it("explains empty scopes instead of leaving a silent Auto-Schedule button", () => {
    const html = renderToStaticMarkup(createElement(AutoScheduleDialog, { ...props, selectedSectionId: undefined, filterSectionIds: [] }));
    expect(html).toContain("No editable sections match these filters");
    expect(html).toContain("disabled=\"\"");
  });
  it("keeps unassigned components visible and blocks placement until a teacher is assigned", () => {
    const html = renderToStaticMarkup(createElement(UnscheduledPanel, {
      needs: [{ subjectId: "cc101", sectionId: "s1", component: "LECTURE", requiredMin: 180, scheduledMin: 0, blockedReason: "Needs teacher: assign a teacher in Subjects first." }],
      editable: true, onAdd: vi.fn(), label: () => ({ title: "CC101", subtitle: "Computing", preferredFaculty: "Needs teacher" }),
    }));
    expect(html).toContain("CC101");
    expect(html).toContain("Assigned teacher: Needs teacher");
    expect(html).toContain("assign a teacher in Subjects first");
    expect(html).toContain("disabled=\"\"");
  });
});
