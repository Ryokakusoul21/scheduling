import { describe, expect, it } from "vitest";
import { overrideMetrics, overrideResponse, responseDuration, type OverrideEntry } from "@/lib/bookings/override-metrics";

const now = "2026-11-13T08:00:00.000Z";
const entry = (over: Partial<OverrideEntry> = {}): OverrideEntry => ({
  id: "booking", purpose: "Accreditation", roomId: "r1", room: "Lecture Room", departmentId: "cs", department: "Computing", priority: "URGENT",
  occurredAt: "2026-11-12T08:00:00.000Z", bookingDate: "2026-11-16", restored: false, acknowledgements: [], adjustments: [], ...over,
});
const change = (over: Partial<OverrideEntry["adjustments"][number]> = {}) => ({ scheduleId: "class", date: "2026-11-16", kind: "MOVED", label: "IT201 IT 2-A", ...over });

describe("urgent override report metrics", () => {
  it("does not count bookings without acknowledgement requests as awaiting faculty", () => {
    const data = overrideMetrics([entry()], 90, now);
    expect(data).toMatchObject({ total: 1, pendingResponses: 0, attentionBookings: 0, requiredResponses: 0, responseRate: null, averageResponseHours: null });
    expect(overrideResponse(entry()).state).toBe("NOT_REQUIRED");
  });

  it("counts actual pending faculty replies instead of unresolved bookings", () => {
    const data = overrideMetrics([entry({ acknowledgements: [{ status: "PENDING", respondedAt: null }, { status: "ACKNOWLEDGED", respondedAt: "2026-11-12T09:00:00.000Z" }] }), entry({ id: "no-ack" })], 90, now);
    expect(data).toMatchObject({ total: 2, pendingResponses: 1, awaitingBookings: 1, responseRate: 50, averageResponseHours: null });
  });

  it("keeps alternatives in follow-up even when all requested faculty have replied", () => {
    const data = overrideMetrics([entry({ acknowledgements: [{ status: "ALTERNATIVE_REQUESTED", respondedAt: "2026-11-12T09:00:00.000Z" }] })], 90, now);
    expect(data).toMatchObject({ pendingResponses: 0, attentionBookings: 1, alternativeRequests: 1, responseRate: 100, averageResponseHours: 1 });
    expect(data.rows[0].state).toBe("ALTERNATIVE");
  });

  it("measures average time to the final response only for fully responded overrides", () => {
    const data = overrideMetrics([
      entry({ acknowledgements: [{ status: "ACKNOWLEDGED", respondedAt: "2026-11-12T08:30:00.000Z" }, { status: "ACKNOWLEDGED", respondedAt: "2026-11-12T10:00:00.000Z" }] }),
      entry({ id: "pending", acknowledgements: [{ status: "PENDING", respondedAt: null }] }),
    ], 90, now);
    expect(data.averageResponseHours).toBe(2);
    expect(data.fullyResponded).toBe(1);
  });

  it("deduplicates dated class displacements and excludes make-up sessions", () => {
    const data = overrideMetrics([entry({ adjustments: [change(), change(), change({ kind: "MAKE_UP", date: "2026-11-20" }), change({ scheduleId: "virtual", kind: "ONLINE" })] })], 90, now);
    expect(data.displacedMeetings).toBe(2);
    expect(data.impact.map((item) => item.count)).toEqual([1, 1, 0]);
    expect(data.mostDisplaced).toHaveLength(2);
  });

  it("filters the reporting window and excludes future overrides", () => {
    const entries = [entry(), entry({ id: "old", occurredAt: "2026-10-01T08:00:00.000Z" }), entry({ id: "future", occurredAt: "2026-12-01T08:00:00.000Z" })];
    expect(overrideMetrics(entries, 30, now).total).toBe(1);
    expect(overrideMetrics(entries, 90, now).total).toBe(2);
  });

  it("retains historical class impact but excludes restored overrides from outstanding responses", () => {
    const data = overrideMetrics([entry({ restored: true, acknowledgements: [{ status: "PENDING", respondedAt: null }], adjustments: [change()] })], 90, now);
    expect(data).toMatchObject({ restored: 1, displacedMeetings: 1, pendingResponses: 0, attentionBookings: 0, requiredResponses: 0 });
    expect(data.rows[0].state).toBe("RESTORED");
  });

  it("groups rooms by stored identity even when display names match", () => {
    const data = overrideMetrics([entry(), entry({ id: "second", roomId: "r2" })], 90, now);
    expect(data.byRoom).toHaveLength(2);
    expect(data.byDepartment[0].count).toBe(2);
  });

  it("formats response time without pretending missing samples have a zero duration", () => {
    expect(responseDuration(null)).toBe("—");
    expect(responseDuration(0.25)).toBe("15 min");
    expect(responseDuration(0.005)).toBe("<1 min");
    expect(responseDuration(2)).toBe("2 h");
    expect(responseDuration(48)).toBe("2 days");
  });
});
