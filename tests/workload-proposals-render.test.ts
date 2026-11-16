import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/(dashboard)/workload/actions", () => ({ approveProposalAction: vi.fn(), rejectProposalAction: vi.fn(), editProposalRowAction: vi.fn(), recheckWorkloadAction: vi.fn() }));
import { ProposalCards } from "@/components/workload/proposals";
import { workloadProposalFixture as proposal, workloadPreviewFixture as preview } from "./fixtures/workload-proposal";

const render = (extra = {}) => renderToStaticMarkup(createElement(ProposalCards, { proposals: [proposal], unit: "hours", preview, ...extra }));
describe("workload proposal review presentation", () => {
  it("separates ready changes from blocked ones and names both faculty and the section", () => {
    const html = render();
    expect(html).toContain("Approve ready (2)");
    expect(html).toContain("Needs attention");
    expect(html).toContain("Current faculty");
    expect(html).toContain("Proposed recipient");
    expect(html).toContain("Inactive faculty");
    expect(html).toContain("BSCS 1-A");
    const buttons = [...html.matchAll(/<button[^>]*aria-label="Approve [^"]*"[^>]*>/g)].map((match) => match[0]);
    expect(buttons).toHaveLength(4);
    expect(buttons.filter((button) => /\sdisabled(?:[=>\s])/.test(button))).toHaveLength(2);
  });
  it("offers actual alternatives and explains when only the suggested recipient qualifies", () => {
    const html = render();
    expect(html).toContain("Change recipient");
    expect(html).toContain("Liza Cruz");
    expect(html).toContain("The suggested recipient is the only eligible option right now.");
    expect(html).not.toContain("No other faculty member qualifies");
  });
  it("disables every approval and offers a fresh check for outdated proposals", () => {
    const html = render({ proposals: [{ ...proposal, needsRefresh: true }] });
    expect(html).toContain("Approve ready (0)");
    expect(html).toContain("These suggestions need a fresh check");
    expect(html).toContain("Refresh suggestions");
    expect([...html.matchAll(/<button[^>]*aria-label="Approve [^"]*"[^>]*>/g)].every((match) => /\sdisabled(?:[=>\s])/.test(match[0]))).toBe(true);
  });
  it("keeps view-only users out of approval, rejection and recipient changes", () => {
    const html = render({ readOnly: true });
    expect(html).not.toContain("Approve ready");
    expect(html).not.toContain("Reject selected");
    expect(html).not.toContain("Change recipient");
    expect(html).not.toContain("Refresh suggestions");
  });
});
