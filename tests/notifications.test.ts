import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rows: vi.fn(), count: vi.fn(), update: vi.fn(), session: vi.fn(), account: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: { notification: { findMany: mocks.rows, count: mocks.count, updateMany: mocks.update } } }));
vi.mock("@/lib/auth/session", () => ({ getSession: mocks.session, requireAccount: mocks.account }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { notificationSummary } from "@/lib/notifications/format";
import { decodeNotificationCursor, loadNotifications } from "@/lib/notifications/service";
import { GET } from "@/app/api/notifications/route";
import { markAllNotificationsReadAction, markNotificationReadAction } from "@/app/(dashboard)/notifications/actions";
import { notificationVisibility } from "@/lib/permissions/notifications";
import { authConfig } from "@/auth.config";
import { NextRequest } from "next/server";

const user = { id: "student", role: "STUDENT" };
const row = (id = "n2", message = "Your timetable is ready.", link = "/student/schedule") => ({
  id, userId: user.id, type: "INFO", title: "Schedule published", message, link, isRead: false,
  createdAt: new Date("2026-11-13T03:00:00Z"), departmentId: null,
});

describe("notification summaries, paging and access", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.rows.mockResolvedValue([row()]); mocks.count.mockResolvedValue(1);
    mocks.session.mockResolvedValue({ user }); mocks.account.mockResolvedValue(user);
    mocks.update.mockResolvedValue({ count: 1 });
  });

  it("keeps short messages intact and shows long messages in Details without changing storage", async () => {
    const full = "Your class moved to Room 305. " + "Additional booking information. ".repeat(10);
    mocks.rows.mockResolvedValue([row("n2", full)]);
    const page = await loadNotifications(user);
    expect(page.items[0].message.length).toBeLessThanOrEqual(96);
    expect(page.items[0].message).toContain("Room 305");
    expect(page.items[0].message).toBe("Your class moved to Room 305.");
    expect(page.items[0].fullMessage).toBe(full);
    expect(notificationSummary("  Class\n restored.  ")).toBe("Class restored.");
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it.each([
    ["9 teaching load issue(s) have no automatic fix. Ana Santos stays at 0 hours (minimum 12): no class they are qualified for.", "9 workload issues need manual review."],
    ["1 teaching load issue(s) have no automatic fix. Further information.", "1 workload issue needs manual review."],
    ["2 teaching load reassignment(s) were proposed after: Manual recheck after upgrade. Review them in Faculty Workload.", "2 workload changes await approval."],
    ["Resolve issues on the Scheduler placed or moved one or more of your classes. Check your timetable.", "Your classes were updated. Check your timetable."],
  ])("summarizes a verbose legacy message without losing its count", (original, expected) => {
    expect(notificationSummary(original)).toBe(expected);
  });

  it("keeps an arbitrary long message within the preview limit", () => {
    const summary = notificationSummary("Long notification content without a sentence boundary ".repeat(8));
    expect(summary.length).toBeLessThanOrEqual(96);
    expect(summary.endsWith("…")).toBe(true);
  });

  it("scopes unread results and counts to the caller and paginates equal timestamps by ID", async () => {
    mocks.rows.mockResolvedValue([row("n2"), row("n1")]);
    const first = await loadNotifications(user, { limit: 1, unreadOnly: true });
    expect(first.items.map((n) => n.id)).toEqual(["n2"]);
    expect(decodeNotificationCursor(first.nextCursor!)).toEqual({ id: "n2", createdAt: row().createdAt });
    await loadNotifications(user, { cursor: first.nextCursor!, unreadOnly: true });
    const where = mocks.rows.mock.calls[1][0].where;
    expect(where.AND).toContainEqual({ userId: "student" });
    expect(where.AND).toContainEqual({ isRead: false });
    expect(where.AND[2].OR).toContainEqual({ createdAt: row().createdAt, id: { lt: "n2" } });
    expect(mocks.count).toHaveBeenLastCalledWith({ where: { userId: "student", isRead: false } });
  });

  it.each(["/requests", "https://example.com", "//example.com", "/student\\evil"])("removes unsafe or unauthorized destination %s", async (link) => {
    mocks.rows.mockResolvedValue([row("n", "Updated.", link)]);
    expect((await loadNotifications(user)).items[0].link).toBe("");
  });

  it("applies private-approval visibility when marking one or all notifications read", async () => {
    mocks.account.mockResolvedValue({ id: "registrar", role: "REGISTRAR" });
    await markNotificationReadAction("n"); await markAllNotificationsReadAction();
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: "n", userId: "registrar", ...notificationVisibility("REGISTRAR") }, data: { isRead: true } });
    expect(mocks.update).toHaveBeenCalledWith({ where: { userId: "registrar", isRead: false, ...notificationVisibility("REGISTRAR") }, data: { isRead: true } });
  });

  it("propagates a failed read mutation so the client can retain unread state", async () => {
    mocks.update.mockRejectedValue(new Error("database unavailable"));
    await expect(markNotificationReadAction("n")).rejects.toThrow("database unavailable");
  });

  it("returns authenticated student data without caching it", async () => {
    const response = await GET(new Request("http://localhost/api/notifications?filter=unread"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect((await response.json()).items[0].link).toBe("/student/schedule");
  });

  it("distinguishes authorization, invalid cursors and load failures from an empty inbox", async () => {
    mocks.session.mockResolvedValueOnce(null);
    expect((await GET(new Request("http://localhost/api/notifications"))).status).toBe(401);
    expect((await GET(new Request("http://localhost/api/notifications?cursor=invalid"))).status).toBe(400);
    mocks.rows.mockRejectedValueOnce(new Error("offline"));
    const failed = await GET(new Request("http://localhost/api/notifications"));
    expect(failed.status).toBe(500);
    expect(await failed.json()).toHaveProperty("error");
  });

  it("lets students poll their inbox through the proxy while preserving staff-page restrictions", async () => {
    const authorize = authConfig.callbacks.authorized;
    const auth = { user, expires: "2099-01-01" } as never;
    expect(await authorize({ auth, request: new NextRequest("http://localhost/api/notifications") })).toBe(true);
    expect(await authorize({ auth, request: new NextRequest("http://localhost/requests") })).not.toBe(true);
    expect(await authorize({ auth, request: new NextRequest("http://localhost/api/notifications", { method: "POST" }) })).not.toBe(true);
  });
});
