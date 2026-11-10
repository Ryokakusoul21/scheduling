import Link from "next/link";
import {
  CalendarBlank,
  CheckCircle,
  CalendarCheck,
  ClipboardText,
  Clock,
  SealCheck,
  TrendDown,
  TrendUp,
  UploadSimple,
  UserCheck,
  UserMinus,
  WarningOctagon,
  WarningCircle,
  Users,
} from "@phosphor-icons/react/ssr";
import type { Scope } from "@/lib/permissions/scope";
import { formatRange } from "@/lib/scheduler/timetable";
import { getAdminCounts, getRecentActivity, getToday, getUrgentMoves, getWorkload } from "./data";
import { AttentionList, KpiRow, LINK_CLASS, QuietState, Section, type AttentionItem } from "./kit";
import { PendingFixes } from "./pending-fixes";
import { RecentActivity } from "./recent-activity";

/** Async dashboard sections; each streams in behind its own skeleton. */

const plural = (n: number, word: string, many = `${word}s`) => (n === 1 ? word : many);
const unitOf = (measure: "HOURS" | "UNITS") => (measure === "HOURS" ? "hours" : "units");

export async function AdminKpis({ scope }: { scope: Scope }) {
  const [counts, workload, today] = await Promise.all([getAdminCounts(), getWorkload(scope), getToday()]);
  const approvals = counts.toPublish + counts.pendingRequests + counts.pendingReports + counts.pendingProposals + counts.pendingAccounts;
  const faculty = workload.rows.length;
  return (
    <KpiRow
      items={[
        { label: "Pending approvals", value: approvals, hint: "Classes, reports, accounts", href: "#needs-attention", icon: SealCheck, tone: "info" },
        { label: "Faculty overloaded", value: workload.rows.filter((r) => r.status === "OVERLOADED").length, hint: `of ${faculty} active faculty`, href: "/workload", icon: TrendUp, tone: "danger" },
        { label: "Faculty underloaded", value: workload.rows.filter((r) => r.status === "UNDERLOADED").length, hint: `of ${faculty} active faculty`, href: "/workload", icon: TrendDown, tone: "warning" },
        { label: "Classes today", value: today.total, hint: `${today.upcoming.length} still to come`, href: "/calendar?view=day", icon: CalendarCheck, tone: "info" },
      ]}
    />
  );
}

/** Every item that needs a person, merged from the school-wide counts and the workload check. */
export async function AdminAttention({ scope }: { scope: Scope }) {
  const [c, workload] = await Promise.all([getAdminCounts(), getWorkload(scope)]);
  const flagCount = (kind: string) => workload.flags.filter((f) => f.kind === kind).length;
  const overloaded = workload.rows.filter((r) => r.status === "OVERLOADED").length;

  const items: AttentionItem[] = [
    { key: "conflicts", icon: WarningOctagon, tone: "danger" as const, title: "Double-booking conflicts", detail: "Room, faculty, or section overlaps in active terms", count: c.conflicts, href: "/scheduler" },
    { key: "unassigned", icon: WarningCircle, tone: "danger" as const, title: "Classes without an active teacher", detail: "The automatic check could not reassign these safely", count: flagCount("UNASSIGNED"), href: "/workload" },
    { key: "overloaded", icon: Users, tone: "danger" as const, title: "Faculty over their maximum load", detail: "Check teaching loads and reassign classes", count: overloaded, href: "/workload" },
    { key: "not-applied", icon: WarningCircle, tone: "warning" as const, title: "Fixes not applied", detail: "Suggested fixes that need a manual decision", count: flagCount("NOT_APPLIED"), href: "/workload" },
    { key: "reports", icon: UserMinus, tone: "warning" as const, title: "Faculty unavailability reports", detail: "Reassign or cancel the affected classes", count: c.pendingReports, href: "/adjustments" },
    { key: "publish", icon: UploadSimple, tone: "info" as const, title: "Classes awaiting approval", detail: "Drafts and edits sent for review in the Scheduler", count: c.toPublish, href: "/scheduler" },
    { key: "requests", icon: ClipboardText, tone: "info" as const, title: "Pending schedule requests", detail: "Faculty waiting for a decision", count: c.pendingRequests, href: "/requests" },
    { key: "accounts", icon: UserCheck, tone: "info" as const, title: "Accounts awaiting approval", detail: "Verified registrations need the Registrar", count: c.pendingAccounts, href: "/admin/users" },
    { key: "sections", icon: CalendarBlank, tone: "neutral" as const, title: "Sections with no classes", detail: "Nothing scheduled yet in the active terms", count: c.unscheduledSections, href: "/scheduler" },
  ].filter((a) => a.count > 0);

  return (
    <Section id="needs-attention" title="Needs attention" count={items.length}>
      {items.length === 0 ? (
        <QuietState icon={SealCheck} title="All clear">No conflicts, pending requests, or unpublished classes.</QuietState>
      ) : (
        <AttentionList items={items} />
      )}
    </Section>
  );
}

export async function PendingFixesSection({ scope }: { scope: Scope }) {
  if (scope.role !== "HEAD_OF_DEPARTMENT") return null;
  const workload = await getWorkload(scope);
  const proposals = workload.proposals.filter((p) => p.status === "PENDING");
  if (proposals.length === 0) {
    return (
      <p className="flex items-center gap-2 rounded-xl border bg-card px-4 py-3 text-sm text-muted-foreground">
        <CheckCircle className="size-4 text-emerald-600" aria-hidden /> No workload fixes awaiting approval.
      </p>
    );
  }
  return (
    <Section id="pending-fixes" title="Fixes awaiting approval" count={proposals.length} href="/workload">
      <PendingFixes proposals={proposals} unit={unitOf(workload.limits.measure)} />
    </Section>
  );
}

/** What urgent room bookings moved in the last seven days, so overuse is easy to spot. */
export async function UrgentMovesSection() {
  const m = await getUrgentMoves();
  return (
    <Section id="urgent-moves" title="Moved by urgent bookings" count={m.classes} href="/bookings" linkLabel="Open Room Booking">
      {m.bookings === 0 ? (
        <QuietState icon={CheckCircle} title="No classes moved">Urgent bookings have not moved any class in the last 7 days.</QuietState>
      ) : (
        <div className="space-y-3">
          <p>
            {m.classes} {plural(m.classes, "class", "classes")} moved by {m.bookings} urgent {plural(m.bookings, "booking")} in the last 7 days.
          </p>
          <ul className="flex flex-wrap gap-2" aria-label="Reasons given">
            {m.reasons.map((r) => (
              <li key={r.label} className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium">{r.label} · {r.count}</li>
            ))}
          </ul>
          <ul className="divide-y rounded-lg border">
            {m.latest.map((b, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2 p-3 text-[13px]">
                <span className="min-w-0"><span className="font-medium">{b.purpose}</span> · {b.room}</span>
                <span className="text-muted-foreground">{b.moved} {plural(b.moved, "class", "classes")} moved</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Section>
  );
}

/** Classes still to come today plus meaningful recent changes. */
export async function TodaySection({ isAdmin }: { isAdmin: boolean }) {
  const [today, activity] = await Promise.all([getToday(), getRecentActivity()]);
  const next = today.upcoming.slice(0, 5);
  return (
    <Section id="today" title="Today" href="/calendar?view=day" linkLabel="Open calendar">
      {next.length === 0 ? (
        <QuietState icon={Clock} title="No more classes today">
          <Link href="/calendar" className={LINK_CLASS}>See the calendar</Link>
        </QuietState>
      ) : (
        <ul className="space-y-2">
          {next.map((s) => (
            <li key={s.id} className="flex items-start gap-3 rounded-lg border p-3">
              <span className="w-28 shrink-0 text-[13px] font-medium tabular-nums text-muted-foreground">{formatRange(s.startMin, s.endMin)}</span>
              <span className="min-w-0">
                <span className="block truncate font-medium">{s.subject} · {s.section}</span>
                <span className="block truncate text-[13px] text-muted-foreground">
                  {s.room} · {s.faculty}
                  {s.moved && " · Rescheduled"}
                </span>
              </span>
            </li>
          ))}
          {today.upcoming.length > next.length && (
            <li className="text-[13px] text-muted-foreground">
              and {today.upcoming.length - next.length} more {plural(today.upcoming.length - next.length, "class", "classes")}
            </li>
          )}
        </ul>
      )}
      <div className="border-t pt-4">
        <RecentActivity entries={activity} />
        {isAdmin && <Link href="/admin/audit-logs" className={`${LINK_CLASS} mt-3`}>View audit log</Link>}
      </div>
    </Section>
  );
}
