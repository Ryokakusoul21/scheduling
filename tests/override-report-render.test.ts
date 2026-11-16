import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { OverrideEntry } from "@/lib/bookings/override-metrics";
import type { ReportDoc } from "@/lib/export/report";

const mocks = vi.hoisted(() => ({ export: vi.fn() }));
vi.mock("@/components/ux/export-buttons", () => ({ ReportButtons: ({ doc }: { doc: unknown }) => { mocks.export(doc); return null; } }));
import { OverrideReportView } from "@/components/bookings/override-report-view";

const entry = (id: string, pending = false): OverrideEntry => ({ id, purpose: `Visit ${id}`, roomId: id, room: `Room ${id}`, departmentId: "cs", department: "Computing", priority: "URGENT", occurredAt: "2026-11-12T00:00:00.000Z", bookingDate: "2026-11-16", restored: false,
  acknowledgements: pending ? [{ status: "PENDING", respondedAt: null }] : [], adjustments: [],
});

describe("urgent override report presentation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders follow-up, ranked summaries, reporting periods, and valid booking links", () => {
    const html = renderToStaticMarkup(createElement(OverrideReportView, { data: { entries: [entry("a", true), entry("b")], generatedAt: "2026-11-13T00:00:00.000Z", scopeName: "Computing", scopeNote: "Own scope" } }));
    expect(html).toContain("Faculty response progress");
    expect(html).toContain("Rooms used most often");
    expect(html).toContain("Review follow-up");
    expect(html).toContain("No response required");
    expect(html).toContain("/bookings?booking=a");
    expect(html).toContain("180 days");
    const doc = mocks.export.mock.calls.at(-1)![0] as ReportDoc<OverrideEntry>;
    expect(doc.rows).toHaveLength(2);
    expect(doc.extra?.[0].rows).toContainEqual({ metric: "Faculty replies pending", value: 1 });
  });

  it("provides a usable empty state without invented response-time values", () => {
    const html = renderToStaticMarkup(createElement(OverrideReportView, { data: { entries: [], generatedAt: "2026-11-13T00:00:00.000Z", scopeName: "All departments", scopeNote: "Executed bookings only" } }));
    expect(html).toContain("No urgent overrides in this period");
    expect(html).toContain("Available when all requested faculty have replied");
    expect(html).not.toContain("NaN");
    expect(html).not.toContain("Review follow-up");
  });
});
