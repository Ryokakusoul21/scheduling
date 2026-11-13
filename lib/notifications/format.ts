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
