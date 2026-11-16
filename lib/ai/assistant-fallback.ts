import "server-only";
import type { createAssistantData } from "./assistant-data";

type Data = Awaited<ReturnType<typeof createAssistantData>>;
type Row = Record<string, unknown>;

const MAX_ROWS = 10;
const HELP = `I can answer these without the AI service:
- "My schedule today" or "my schedule tomorrow"
- "Free rooms today at 1 PM"
- "Overloaded faculty" or "underloaded faculty"
- "Rooms", "conflicts", "pending requests", "notifications"
- "Schedule of <section, subject, faculty, or room>"`;

const manilaDate = (addDays = 0) => {
  const d = new Date(Date.now() + addDays * 86_400_000);
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
};
const nowMin = () => {
  const [h, m] = new Date().toLocaleTimeString("en-GB", { timeZone: "Asia/Manila", hour12: false }).split(":").map(Number);
  return h * 60 + m;
};

/** Reads "1 pm", "1:30pm", or "13:00" from the message as minutes since midnight. */
function parseTime(text: string) {
  const m = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/);
  if (!m || (!m[3] && !m[2])) return null;
  let h = Number(m[1]) % 12 + (m[3] === "pm" ? 12 : 0);
  if (!m[3]) h = Number(m[1]);
  return h * 60 + Number(m[2] ?? 0);
}

/** Formats one tool row as a single readable line, skipping identifiers and nested data. */
function line(row: Row) {
  return "- " + Object.entries(row)
    .filter(([k, v]) => !/id$/i.test(k) && v !== null && v !== undefined && v !== "" && typeof v !== "object")
    .map(([k, v]) => `${k.replace(/([A-Z])/g, " $1").toLowerCase()}: ${v}`)
    .join(", ");
}

function format(title: string, result: Record<string, unknown>) {
  if (typeof result.error === "string") return result.error;
  const rows = (Array.isArray(result.rows) ? result.rows : Array.isArray(result.items) ? result.items : []) as Row[];
  if (!rows.length) return `${title}: no records found.`;
  const total = typeof result.total === "number" ? result.total : rows.length;
  const more = total > Math.min(rows.length, MAX_ROWS) ? `\n\nShowing ${Math.min(rows.length, MAX_ROWS)} of ${total}. Ask a narrower question to see others.` : "";
  return `${title}:\n${rows.slice(0, MAX_ROWS).map(line).join("\n")}${more}`;
}

/** Answers common questions from live data with simple keyword matching when the AI service is unavailable. */
export async function fallbackReply(data: Data, message: string) {
  const text = message.toLowerCase();
  const date = /\btomorrow\b/.test(text) ? manilaDate(1) : /\btoday\b|\bnow\b/.test(text) ? manilaDate() : undefined;
  const run = async (title: string, tool: string, args: Record<string, unknown>) => format(title, await data.execute(tool, args).catch(() => ({ error: "Live data could not be retrieved. Please try again." })));

  if (/\b(free|available|vacant)\b.*\broom|\broom.*\b(free|available|vacant)\b/.test(text)) {
    const start = parseTime(text) ?? Math.min(Math.ceil(nowMin() / 30) * 30, 20 * 60);
    return run("Room availability", "getRoomAvailability", { date: date ?? manilaDate(), startMin: start, endMin: Math.min(start + 60, 1440) });
  }
  if (/overload/.test(text)) return run("Overloaded faculty", "getWorkloads", { status: "OVERLOADED" });
  if (/underload/.test(text)) return run("Underloaded faculty", "getWorkloads", { status: "UNDERLOADED" });
  if (/\b(work)?loads?\b|teaching hours/.test(text)) return run("Faculty workloads", "getWorkloads", {});
  if (/conflict|double.?book/.test(text)) return run("Conflicts", "getConflicts", {});
  if (/request|approval|pending/.test(text)) return run("Requests", "getRequests", {});
  if (/notification|alert|unread/.test(text)) return run("Notifications", "getNotifications", {});
  if (/\bmy\b.*\b(schedule|class|classes|timetable)\b/.test(text)) return run(date ? `Your classes on ${date}` : "Your weekly classes", "getSchedule", { mine: true, ...(date ? { date } : {}) });
  const about = text.match(/(?:schedule|classes|timetable)\s+(?:of|for)\s+(.+)/)?.[1]?.replace(/\b(today|tomorrow)\b|[?.!]/g, "").trim();
  if (about) return run(`Classes for ${about}`, "getSchedule", { query: about.slice(0, 100), ...(date ? { date } : {}) });
  if (/\brooms?\b/.test(text)) return run("Rooms", "getRooms", {});
  return HELP;
}
