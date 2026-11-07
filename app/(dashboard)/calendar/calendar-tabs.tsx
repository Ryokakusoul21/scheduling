import { CalendarDots, ClipboardText, SealCheck, Table } from "@phosphor-icons/react/ssr";
import { PageTabs, type PageTab } from "@/components/ux/page-tabs";

export type CalendarTab = "calendar" | "table" | "approvals" | "proposals";

/** Section tabs shared by the Calendar of Activities and the Semester Proposals pages. */
export function CalendarTabs({ active, isAdmin, showProposals, pendingCount = 0 }: { active: CalendarTab; isAdmin: boolean; showProposals: boolean; pendingCount?: number }) {
  const tabs: (PageTab & { show: boolean })[] = [
    { href: "/calendar?tab=calendar", label: "Calendar", icon: CalendarDots, active: active === "calendar", show: true },
    { href: "/calendar?tab=table", label: "Table", icon: Table, active: active === "table", show: true },
    { href: "/calendar?tab=approvals", label: "Activity Approvals", icon: SealCheck, active: active === "approvals", badge: pendingCount, show: isAdmin },
    { href: "/calendar/proposals", label: "Semester Proposals", icon: ClipboardText, active: active === "proposals", show: showProposals },
  ];
  return <PageTabs label="Calendar of Activities sections" tabs={tabs.filter((t) => t.show)} />;
}
