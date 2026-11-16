import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppRole } from "@/lib/permissions/roles";

const mocks = vi.hoisted(() => ({ activities: vi.fn(), users: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { activity: { findMany: mocks.activities }, user: { findMany: mocks.users } } }));
vi.mock("@/lib/occupancy/load", () => ({ loadPlan: vi.fn() }));

import { DashboardActivities } from "@/components/dashboard/activities";
import { DashboardActivityCalendar, type DashboardActivity } from "@/components/dashboard/activity-calendar";

const activity = (id: string, startDate: string, endDate = startDate, overrides: Partial<DashboardActivity> = {}): DashboardActivity => ({
  id, title: id, type: "SCHOOL_EVENT", startDate, endDate, startMin: null, endMin: null, ...overrides,
});
const render = (activities: DashboardActivity[], href?: string) => renderToStaticMarkup(createElement(DashboardActivityCalendar, { activities, today: "2026-11-15", href }));

describe("dashboard activity access", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.activities.mockResolvedValue([]); mocks.users.mockResolvedValue([]); });

  it.each<AppRole>(["SUPER_ADMINISTRATOR", "REGISTRAR", "HEAD_OF_DEPARTMENT", "FACULTY", "STUDENT"])("uses approved calendar activities for %s", async (role) => {
    const isAdmin = role === "SUPER_ADMINISTRATOR" || role === "REGISTRAR";
    await DashboardActivities({ scope: { role, isAdmin, departmentId: "own" }, today: "2026-11-15" });
    const visibility = isAdmin ? {} : role === "HEAD_OF_DEPARTMENT"
      ? { OR: [{ departmentId: "own" }, { departmentId: null, status: "APPROVED" }] }
      : { status: "APPROVED", OR: [{ departmentId: null }, { departmentId: "own" }] };
    expect(mocks.activities.mock.calls[0][0].where).toEqual({ AND: [visibility, { status: "APPROVED" }] });
  });

  it("limits students without a section to approved school-wide activities", async () => {
    await DashboardActivities({ scope: { role: "STUDENT", isAdmin: false, departmentId: null }, today: "2026-11-15", href: "/student/calendar" });
    expect(mocks.activities.mock.calls[0][0].where.AND[0]).toEqual({ status: "APPROVED", OR: [{ departmentId: null }] });
  });

  it("passes display fields to the browser without internal review or submitter data", async () => {
    mocks.activities.mockResolvedValue([{
      ...activity("assembly", "2026-11-16"), startDate: new Date("2026-11-16T00:00:00Z"), endDate: new Date("2026-11-16T00:00:00Z"),
      description: "Description", departmentId: null, department: null, roomId: null, room: null, batch: null, location: "Main hall",
      status: "APPROVED", createdById: "registrar", createdAt: new Date("2026-11-01T00:00:00Z"), reviewNote: "Internal review note",
    }]);
    mocks.users.mockResolvedValue([{ id: "registrar", name: "Registrar" }]);
    const result = await DashboardActivities({ scope: { role: "FACULTY", isAdmin: false, departmentId: "own" }, today: "2026-11-15" });
    expect(result.props.activities).toEqual([activity("assembly", "2026-11-16", undefined, { location: "Main hall" })]);
  });
});

describe("compact dashboard calendar", () => {
  it("marks activity dates and lists ongoing and upcoming events in date and time order", () => {
    const html = render([
      activity("Finished activity", "2026-11-01"),
      activity("Afternoon assembly", "2026-11-16", undefined, { startMin: 780, endMin: 840, location: "Main hall" }),
      activity("Morning assembly", "2026-11-16", undefined, { startMin: 480, endMin: 540 }),
      activity("Ongoing festival", "2026-11-14", "2026-11-17"),
      activity("Next month event", "2026-12-01"),
    ]);
    expect(html).toContain("November 2026");
    expect(html).toContain('aria-current="date"');
    expect(html).toContain("Monday, November 16, 2026, 3 activities");
    expect(html).not.toContain("Finished activity");
    expect(html).not.toContain("Next month event");
    expect(html.indexOf("Ongoing festival")).toBeLessThan(html.indexOf("Morning assembly"));
    expect(html.indexOf("Morning assembly")).toBeLessThan(html.indexOf("Afternoon assembly"));
    expect(html).toContain("Main hall");
    expect(html).toContain("All day");
    expect(html).toContain("8:00");
  });

  it("keeps an activity visible across month boundaries", () => {
    const html = render([activity("Long festival", "2026-10-30", "2026-11-20")]);
    expect(html).toContain("Long festival");
    expect(html).toContain("Sunday, November 15, 2026, 1 activity");
  });

  it("shows an empty state, month navigation, and a link to the correct role calendar", () => {
    const html = render([], "/student/calendar");
    expect(html).toContain("No upcoming activities this month");
    expect(html).toContain('aria-label="Previous month"');
    expect(html).toContain('aria-label="Next month"');
    expect(html).toContain('href="/student/calendar"');
  });

  it("limits the preview while offering access to the complete activity list", () => {
    const html = render(Array.from({ length: 7 }, (_, index) => activity(`Event ${index + 1}`, `2026-11-${16 + index}`)));
    expect(html).toContain("Event 5");
    expect(html).not.toContain("Event 6");
    expect(html).toContain("View all 7 activities");
  });
});
