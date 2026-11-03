import { describe, expect, it } from "vitest";
import { inferActivityCategory, parseActivityDate, parseActivityTime } from "@/lib/activities/proposals";

describe("school activity proposal dates", () => {
  it.each([
    ["July 28, 2026", "2026-07-28", "2026-07-28"],
    ["August 14-17, 2026", "2026-08-14", "2026-08-17"],
    ["September 1 to September 5, 2026", "2026-09-01", "2026-09-05"],
    ["September 28 – October 2, 2026", "2026-09-28", "2026-10-02"],
    ["January 7-13, 2027", "2027-01-07", "2027-01-13"],
  ])("parses %s", (input, startDate, endDate) => expect(parseActivityDate(input)).toEqual({ startDate, endDate }));

  it("rejects reversed and impossible dates", () => {
    expect(parseActivityDate("August 17-14, 2026")).toBeNull();
    expect(parseActivityDate("February 30, 2027")).toBeNull();
  });

  it("parses optional time ranges", () => {
    expect(parseActivityTime("")).toEqual({ startMin: null, endMin: null });
    expect(parseActivityTime("8:30 AM-12:00 PM")).toEqual({ startMin: 510, endMin: 720 });
  });

  it.each([
    ["Midterm Examinations", "EXAMINATION_WEEK"],
    ["All Saints Day", "HOLIDAY"],
    ["Classes Suspended due to Typhoon", "CLASS_SUSPENSION"],
    ["Information Technology Day", "SCHOOL_EVENT"],
  ])("infers %s as %s", (title, category) => expect(inferActivityCategory(title)).toBe(category));
});
