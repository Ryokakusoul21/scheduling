const TZ = "Asia/Manila";

const dayKey = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: TZ });

/** "Today at 12:20 PM", "Yesterday at 9:05 AM", or "Nov 1, 2026 at 5:57 PM" in school time. */
export function formatWhen(d: Date, now = new Date()) {
  const time = d.toLocaleTimeString("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" });
  const days = Math.round((Date.parse(dayKey(now)) - Date.parse(dayKey(d))) / 86_400_000);
  const date =
    days === 0 ? "Today" : days === 1 ? "Yesterday" : d.toLocaleDateString("en-US", { timeZone: TZ, month: "short", day: "numeric", year: "numeric" });
  return `${date} at ${time}`;
}

/** "just now", "5 minutes ago", "3 hours ago", "2 days ago". */
export function timeAgo(d: Date, now = new Date()) {
  const s = Math.max(0, Math.round((now.getTime() - d.getTime()) / 1000));
  if (s < 60) return "just now";
  const units: [number, string][] = [[86_400, "day"], [3600, "hour"], [60, "minute"]];
  const [size, unit] = units.find(([n]) => s >= n)!;
  const n = Math.floor(s / size);
  return `${n} ${unit}${n === 1 ? "" : "s"} ago`;
}
