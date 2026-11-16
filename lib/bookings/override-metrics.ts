export interface OverrideEntry {
  id: string;
  purpose: string;
  roomId: string;
  room: string;
  departmentId: string | null;
  department: string;
  priority: string;
  occurredAt: string;
  bookingDate: string;
  restored: boolean;
  acknowledgements: { status: string; respondedAt: string | null }[];
  adjustments: { scheduleId: string; date: string; kind: string; label: string }[];
}

export type OverrideResponseState = "WAITING" | "ALTERNATIVE" | "RESPONDED" | "NOT_REQUIRED" | "RESTORED";
export const OVERRIDE_RESPONSE_LABELS: Record<OverrideResponseState, string> = {
  WAITING: "Awaiting faculty", ALTERNATIVE: "Alternative requested", RESPONDED: "All faculty responded", NOT_REQUIRED: "No response required", RESTORED: "Restored / cancelled",
};
const hasResponse = (ack: OverrideEntry["acknowledgements"][number]) => ack.status !== "PENDING" && !!ack.respondedAt;

export function overrideResponse(entry: OverrideEntry) {
  const pending = entry.restored ? 0 : entry.acknowledgements.filter((ack) => !hasResponse(ack)).length;
  const alternatives = entry.restored ? 0 : entry.acknowledgements.filter((ack) => ack.status === "ALTERNATIVE_REQUESTED").length;
  const state: OverrideResponseState = entry.restored ? "RESTORED" : alternatives ? "ALTERNATIVE" : pending ? "WAITING" : entry.acknowledgements.length ? "RESPONDED" : "NOT_REQUIRED";
  return { pending, alternatives, state };
}

function rank(rows: { id: string; label: string }[]) {
  const totals = new Map<string, { id: string; label: string; count: number }>();
  for (const row of rows) {
    const current = totals.get(row.id);
    if (current) current.count++; else totals.set(row.id, { ...row, count: 1 });
  }
  return [...totals.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/** One historical displacement per class/date/override; subsequent make-up sessions are excluded. */
export function overrideMetrics(entries: readonly OverrideEntry[], days: number, now: string) {
  const until = Date.parse(now);
  const since = until - days * 86_400_000;
  const rows = entries.filter((entry) => Date.parse(entry.occurredAt) >= since && Date.parse(entry.occurredAt) <= until)
    .map((entry) => ({ ...entry, adjustments: [...new Map(entry.adjustments.filter((item) => item.kind !== "MAKE_UP").map((item) => [`${item.scheduleId}:${item.date}`, item])).values()], ...overrideResponse(entry) }))
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  const responseRows = rows.filter((entry) => !entry.restored && entry.acknowledgements.length > 0);
  const fullyResponded = responseRows.filter((entry) => entry.acknowledgements.every(hasResponse));
  const hours = fullyResponded.map((entry) => Math.max(0, (Math.max(...entry.acknowledgements.map((ack) => Date.parse(ack.respondedAt!))) - Date.parse(entry.occurredAt)) / 3_600_000));
  const acknowledgements = responseRows.flatMap((entry) => entry.acknowledgements);
  const adjustments = rows.flatMap((entry) => entry.adjustments);
  const received = acknowledgements.filter(hasResponse).length;
  return {
    days, rows, total: rows.length, displacedMeetings: adjustments.length,
    pendingResponses: rows.reduce((sum, row) => sum + row.pending, 0),
    awaitingBookings: rows.filter((row) => row.pending > 0).length,
    alternativeRequests: rows.reduce((sum, row) => sum + row.alternatives, 0),
    attentionBookings: rows.filter((row) => row.pending > 0 || row.alternatives > 0).length,
    requiredResponses: acknowledgements.length, receivedResponses: received,
    responseRate: acknowledgements.length ? Math.round(received / acknowledgements.length * 100) : null,
    averageResponseHours: hours.length ? hours.reduce((a, b) => a + b, 0) / hours.length : null,
    fullyResponded: fullyResponded.length, restored: rows.filter((row) => row.restored).length,
    impact: [
      { label: "Moved to another slot or room", count: adjustments.filter((item) => item.kind === "MOVED").length },
      { label: "Continued virtually", count: adjustments.filter((item) => item.kind === "ONLINE").length },
      { label: "Cancelled meetings", count: adjustments.filter((item) => item.kind === "CANCELLED").length },
    ],
    byDepartment: rank(rows.map((row) => ({ id: row.departmentId ?? "__none__", label: row.department }))),
    byRoom: rank(rows.map((row) => ({ id: row.roomId, label: row.room }))),
    mostDisplaced: rank(adjustments.map((item) => ({ id: item.scheduleId, label: item.label }))),
  };
}

export function responseDuration(hours: number | null) {
  if (hours === null) return "—";
  if (hours < 1 / 60) return "<1 min";
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  if (hours < 24) return `${Math.round(hours * 10) / 10} h`;
  return `${Math.round(hours / 24 * 10) / 10} days`;
}
