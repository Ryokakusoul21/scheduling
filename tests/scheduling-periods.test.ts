import { describe, expect, it } from "vitest";
import { isPeriodOpenNow } from "@/lib/scheduler/period-rules";

const start = new Date("2026-11-01T00:00:00.000Z");
const end = new Date("2026-11-15T23:59:59.999Z");

describe("scheduling submission periods", () => {
  it("allows an open period inside its inclusive date range", () => {
    expect(isPeriodOpenNow({ status: "OPEN", startsAt: start, endsAt: end }, new Date("2026-11-10T12:00:00.000Z"))).toBe(true);
  });

  it("closes periods outside their dates or when manually closed", () => {
    expect(isPeriodOpenNow({ status: "OPEN", startsAt: start, endsAt: end }, new Date("2026-10-31T23:59:59.999Z"))).toBe(false);
    expect(isPeriodOpenNow({ status: "OPEN", startsAt: start, endsAt: end }, new Date("2026-11-16T00:00:00.000Z"))).toBe(false);
    expect(isPeriodOpenNow({ status: "CLOSED", startsAt: start, endsAt: end }, new Date("2026-11-10T12:00:00.000Z"))).toBe(false);
  });
});
