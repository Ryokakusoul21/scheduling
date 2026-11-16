import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { groupNotifications, notificationRelativeTime, type NotificationItem } from "@/lib/notifications/format";
import { NotificationFeed, NotificationEmpty } from "@/components/notifications/notification-feed";

const now = new Date("2026-11-15T01:00:00Z");
const item = (id: string, createdAt: string, overrides: Partial<NotificationItem> = {}): NotificationItem => ({
  id, createdAt, type: "INFO", title: `Update ${id}`, message: "Your timetable was updated.", fullMessage: null, isRead: false, link: "/scheduler", ...overrides,
});

describe("notification date presentation", () => {
  it("groups notifications using the local calendar date across the UTC day boundary", () => {
    const rows = [item("older", "2026-11-13T03:00:00Z"), item("today", "2026-11-14T16:05:00Z"), item("yesterday", "2026-11-14T15:59:00Z"), item("latest", "2026-11-15T00:30:00Z")];
    expect(groupNotifications(rows, now).map((group) => ({ label: group.label, ids: group.items.map((row) => row.id) }))).toEqual([
      { label: "Today", ids: ["latest", "today"] }, { label: "Yesterday", ids: ["yesterday"] }, { label: "Earlier", ids: ["older"] },
    ]);
    expect(rows[0].id).toBe("older");
  });

  it("handles previous-month and previous-year boundaries without empty sections", () => {
    expect(groupNotifications([item("previous", "2026-12-31T15:59:00Z")], new Date("2026-12-31T16:10:00Z"))[0].label).toBe("Yesterday");
    expect(groupNotifications([], now)).toEqual([]);
  });

  it.each([
    ["2026-11-15T00:59:40Z", "Just now"], ["2026-11-15T00:45:00Z", "15m ago"],
    ["2026-11-14T22:00:00Z", "3h ago"], ["2026-11-13T01:00:00Z", "2d ago"],
    ["2026-11-15T01:00:05Z", "Just now"],
  ])("formats %s as %s", (date, expected) => {
    expect(notificationRelativeTime(date, now)).toBe(expected);
  });
});

describe("notification feed", () => {
  it("keeps unread actions, authorized links, full messages, and read statuses available", () => {
    const html = renderToStaticMarkup(createElement(NotificationFeed, {
      items: [
        item("new", "2026-11-15T00:30:00Z", { title: "Class moved", fullMessage: "Your timetable was updated. " + "The complete room and schedule details remain available. ".repeat(4) }),
        item("read", "2026-11-14T10:00:00Z", { title: "Timetable published", isRead: true, link: "" }),
      ], now, pending: false, onRead: vi.fn(),
    }));
    expect(html).toContain("Today");
    expect(html).toContain("Yesterday");
    expect(html).toContain("Class moved");
    expect(html).toContain("Mark “Class moved” as read");
    expect(html).not.toContain("Mark “Timetable published” as read");
    expect(html).toContain('href="/scheduler"');
    expect(html).toContain("Read full message");
    expect(html).toContain("The complete room and schedule details remain available.");
    expect(html).toContain('dateTime="2026-11-15T00:30:00Z"');
  });

  it("disables mark-as-read controls while a mutation is in progress", () => {
    const html = renderToStaticMarkup(createElement(NotificationFeed, { items: [item("new", now.toISOString())], now, compact: true, pending: true, onRead: vi.fn() }));
    expect(html).toMatch(/<button[^>]*disabled=""/);
  });

  it("provides different empty states for an empty inbox and a completed unread list", () => {
    expect(renderToStaticMarkup(createElement(NotificationEmpty, { unreadOnly: true }))).toContain("You’re all caught up");
    expect(renderToStaticMarkup(createElement(NotificationEmpty, { unreadOnly: false }))).toContain("No notifications yet");
  });
});
