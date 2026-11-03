import Link from "next/link";
import {
  CalendarBlank,
  CalendarCheck,
  ClipboardText,
  Clock,
  Gauge,
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
import { getAdminCounts, getRecentActivity, getToday, getWorkload } from "./data";
import { AttentionList, KpiRow, LINK_CLASS, QuietState, Section, type AttentionItem } from "./kit";
import { LatestFixes } from "./latest-fixes";
import { PendingFixes } from "./pending-fixes";
import { RecentActivity } from "./recent-activity";
import { WorkloadChart } from "./workload-chart";

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
        { label: "Pending approvals", value: approvals, hint: "Classes, requests, reports, workload, accounts", href: "#needs-attention", icon: SealCheck, tone: "info" },
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
    { key: "accounts", icon: UserCheck, tone: "info" as const, title: "Accounts awaiting approval", detail: "Verified registrations need the Administrator", count: c.pendingAccounts, href: "/admin/users" },
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
  const workload = await getWorkload(scope);
  const proposals = workload.proposals.filter((p) => p.status === "PENDING");
  return (
    <Section id="pending-fixes" title="Fixes awaiting approval" count={proposals.length} href="/workload">
      <PendingFixes proposals={proposals} unit={unitOf(workload.limits.measure)} />
    </Section>
  );
}

export async function WorkloadSection({ scope, title = "Faculty workload" }: { scope: Scope; title?: string }) {
  const workload = await getWorkload(scope);
  const checkedAt = workload.status?.checkedAt;
  return (
    <Section
      id="faculty-workload"
      title={title}
      count={workload.rows.length}
      actions={
        <span className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
          <Gauge className="size-4" />
          Head of Department approval required
          {checkedAt && ` · Checked ${new Date(checkedAt).toLocaleTimeString("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" })}`}
        </span>
      }
    >
      <WorkloadChart rows={workload.rows} unit={unitOf(workload.limits.measure)} />
    </Section>
  );
}

export async function LatestFixesSection({ scope }: { scope: Scope }) {
  const workload = await getWorkload(scope);
  return (
    <Section id="latest-fixes" title="Latest fixes" href="/workload">
      <LatestFixes fixes={workload.fixes} />
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
