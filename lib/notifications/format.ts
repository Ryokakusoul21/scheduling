/** Compact summaries for old and new notifications; the original stays available in Details. */
export function notificationSummary(value: string, limit = 96) {
  let text = value.replace(/\s+/g, " ").trim();
  // Summarize older system messages as well as notifications created with the newer templates.
  const issues = text.match(/^(\d+) teaching load issue\(s\) have no automatic fix\./i);
  const changes = text.match(/^(\d+) teaching load reassignment\(s\) were proposed after:/i);
  if (issues) text = `${issues[1]} workload ${issues[1] === "1" ? "issue needs" : "issues need"} manual review.`;
  else if (changes) text = `${changes[1]} workload ${changes[1] === "1" ? "change awaits" : "changes await"} approval.`;
  else if (text.startsWith("Resolve issues on the Scheduler placed or moved")) text = "Your classes were updated. Check your timetable.";
  else if (text.startsWith("Classes moved by Resolve issues on the Scheduler are back")) text = "Your classes are back to their previous schedule.";
  else if (/^The higher-priority booking.*back in its original room\.$/i.test(text)) text = "Your booking is back in its original room.";
  if (text.length <= limit) return text;
  // Prefer a complete sentence to a cut-off paragraph when it carries the update on its own.
  const firstSentence = text.match(/^(.{24,}?[.!?])(?:\s|$)/)?.[1];
  if (firstSentence && firstSentence.length <= limit) return firstSentence;
  const prefix = text.slice(0, limit - 1);
  const boundary = prefix.lastIndexOf(" ");
  return `${prefix.slice(0, boundary > limit * 0.6 ? boundary : prefix.length).trimEnd()}…`;
}

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  fullMessage: string | null;
  isRead: boolean;
  link: string;
  createdAt: string;
}

export interface NotificationPage {
  items: NotificationItem[];
  unread: number;
  nextCursor: string | null;
}

export function notificationTime(value: string) {
  return new Date(value).toLocaleString("en-PH", {
    timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short",
  });
}

/** Calendar-day groups use the school's UTC+8 date, regardless of the device timezone. */
export function groupNotifications(items: NotificationItem[], now: Date) {
  const dateOf = (date: Date) => date.toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" });
  const today = dateOf(now);
  const yesterday = new Date(`${today}T00:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const previousDate = yesterday.toISOString().slice(0, 10);
  const groups: { label: string; items: NotificationItem[] }[] = [
    { label: "Today", items: [] }, { label: "Yesterday", items: [] }, { label: "Earlier", items: [] },
  ];
  for (const item of [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))) {
    const date = dateOf(new Date(item.createdAt));
    groups[date === today ? 0 : date === previousDate ? 1 : 2].items.push(item);
  }
  return groups.filter((group) => group.items.length > 0);
}

export function notificationRelativeTime(value: string, now: Date) {
  const elapsed = Math.max(0, now.getTime() - new Date(value).getTime());
  if (elapsed < 60_000) return "Just now";
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)}m ago`;
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)}h ago`;
  if (elapsed < 7 * 86_400_000) return `${Math.floor(elapsed / 86_400_000)}d ago`;
  return new Date(value).toLocaleDateString("en-PH", { timeZone: "Asia/Taipei", month: "short", day: "numeric", year: "numeric" });
}
