import { getSession } from "@/lib/auth/session";
import { decodeNotificationCursor, loadNotifications } from "@/lib/notifications/service";

export async function GET(request: Request) {
  const user = (await getSession())?.user;
  const headers = { "Cache-Control": "private, no-store" };
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401, headers });
  const params = new URL(request.url).searchParams;
  const cursor = params.get("cursor") ?? undefined;
  if (cursor && (cursor.length > 500 || !decodeNotificationCursor(cursor))) {
    return Response.json({ error: "Invalid cursor" }, { status: 400, headers });
  }
  try {
    const page = await loadNotifications(user, {
      unreadOnly: params.get("filter") === "unread", cursor,
      limit: params.get("recent") === "1" ? 15 : 25,
    });
    return Response.json(page, { headers });
  } catch {
    return Response.json({ error: "Could not load notifications. Please retry." }, { status: 500, headers });
  }
}
