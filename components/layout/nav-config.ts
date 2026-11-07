import { TEACHING_ROLES, type AppRole } from "@/lib/permissions/roles";
import type { Icon } from "@phosphor-icons/react";
import {
  SquaresFour as LayoutDashboard,
  CalendarDots as CalendarClock,
  CalendarCheck,
  ClipboardText as ClipboardList,
  CalendarBlank as CalendarDays,
  BookOpen,
  Books,
  Stack as Layers,
  Users,
  UserSquare as UserSquare2,
  UserMinus,
  Buildings as Building2,
  ChartBar as BarChart3,
  Bell,
  ClockCounterClockwise as History,
  Gear as Settings,
  Robot as Bot,
  UsersThree,
  DoorOpen,
  ArrowsClockwise,
  Gauge,
  UploadSimple,
  ShieldCheck,
  UserCircle,
  Table,
} from "@phosphor-icons/react/ssr";

export interface NavItem {
  label: string;
  href: string;
  icon: Icon;
  roles?: AppRole[];
  /** Keyboard shortcut hint shown in the sidebar tooltip (handled by ShortcutProvider). */
  shortcut?: string;
  /** Pages sharing a tab group get one sidebar entry and a tab bar; see TAB_GROUPS. */
  tabGroup?: TabGroupId;
  /** Every path the entry covers once its group is collapsed into one sidebar entry. */
  match?: string[];
}

export type TabGroupId = "changes" | "teaching" | "setup" | "reports" | "system";

/** Sidebar entry used when a person can open more than one page of the group. */
export const TAB_GROUPS: Record<TabGroupId, { label: string; icon: Icon }> = {
  changes: { label: "Scheduling Changes", icon: ArrowsClockwise },
  teaching: { label: "My Teaching", icon: Gauge },
  setup: { label: "Academic Setup", icon: Layers },
  reports: { label: "Reports and Analytics", icon: BarChart3 },
  system: { label: "System Administration", icon: Settings },
};

export interface NavGroup {
  label: string;
  items: NavItem[];
}

const STAFF: AppRole[] = ["SUPER_ADMINISTRATOR", "REGISTRAR", "HEAD_OF_DEPARTMENT"];
const ADMIN: AppRole[] = ["SUPER_ADMINISTRATOR", "REGISTRAR"];
const SUPER: AppRole[] = ["SUPER_ADMINISTRATOR"];

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, shortcut: "g d" },
      { label: "Notifications", href: "/notifications", icon: Bell, shortcut: "g n" },
    ],
  },
  {
    label: "Scheduling",
    items: [
      { label: "Scheduler", href: "/scheduler", icon: CalendarClock, shortcut: "g s" },
      { label: "Calendar of Activities", href: "/calendar", icon: CalendarCheck, shortcut: "g c" },
      { label: "Room Booking", href: "/bookings", icon: DoorOpen, shortcut: "g b" },
      { label: "Schedule Adjustments", href: "/adjustments", icon: ArrowsClockwise, roles: STAFF, tabGroup: "changes" },
      { label: "Schedule Requests", href: "/requests", icon: ClipboardList, tabGroup: "changes" },
      { label: "Scheduling Constraints", href: "/constraints", icon: ShieldCheck, roles: STAFF, tabGroup: "changes" },
      { label: "Scheduling Assistant", href: "/assistant", icon: Bot },
    ],
  },
  {
    label: "My Teaching",
    items: [
      { label: "My Teaching Load", href: "/workload", icon: Gauge, roles: ["FACULTY"], tabGroup: "teaching" },
      { label: "My Assigned Subjects", href: "/my-subjects", icon: Books, roles: TEACHING_ROLES, tabGroup: "teaching" },
      { label: "Report Unavailability", href: "/availability", icon: UserMinus, roles: TEACHING_ROLES, tabGroup: "teaching" },
    ],
  },
  {
    label: "Management",
    items: [
      { label: "Academic Years and Terms", href: "/academic-years", icon: CalendarDays, roles: ADMIN, shortcut: "g y", tabGroup: "setup" },
      { label: "Programs and Strands", href: "/programs", icon: Layers, roles: STAFF, shortcut: "g p", tabGroup: "setup" },
      { label: "Subjects", href: "/subjects", icon: BookOpen, roles: STAFF, shortcut: "g u", tabGroup: "setup" },
      { label: "Sections", href: "/sections", icon: UsersThree, roles: STAFF, shortcut: "g e", tabGroup: "setup" },
      { label: "Faculty", href: "/faculty", icon: UserSquare2, roles: STAFF, shortcut: "g f", tabGroup: "setup" },
      { label: "Rooms", href: "/rooms", icon: Building2, roles: STAFF, shortcut: "g r", tabGroup: "setup" },
      { label: "Bulk Data Import", href: "/import", icon: UploadSimple, roles: STAFF, tabGroup: "setup" },
      { label: "Timetable Analytics", href: "/analytics", icon: BarChart3, roles: STAFF, tabGroup: "reports" },
      { label: "Faculty Workload", href: "/workload", icon: Gauge, roles: STAFF, tabGroup: "reports" },
      { label: "Schedule Reports", href: "/reports", icon: BarChart3, roles: STAFF, tabGroup: "reports" },
    ],
  },
  {
    label: "Administration",
    items: [
      { label: "Registrar Review Center", href: "/admin/review-center", icon: ShieldCheck, roles: ADMIN },
      { label: "User Management", href: "/admin/users", icon: Users, roles: SUPER, tabGroup: "system" },
      { label: "Audit Logs", href: "/admin/audit-logs", icon: History, roles: SUPER, tabGroup: "system" },
      { label: "System Settings", href: "/admin/settings", icon: Settings, roles: SUPER, tabGroup: "system" },
    ],
  },
];

/** Student portal navigation; every page lives under /student and is read-only. */
export const STUDENT_NAV: NavGroup[] = [
  {
    label: "Student Portal",
    items: [
      { label: "Dashboard", href: "/student", icon: LayoutDashboard },
      { label: "My Schedule", href: "/student/schedule", icon: Table },
      { label: "Subjects", href: "/student/subjects", icon: BookOpen },
      { label: "Rooms", href: "/student/rooms", icon: Building2 },
      { label: "Calendar of Activities", href: "/student/calendar", icon: CalendarCheck },
      { label: "Notifications", href: "/student/notifications", icon: Bell },
      { label: "Profile", href: "/student/profile", icon: UserCircle },
    ],
  },
];

export const onPath = (pathname: string, href: string) => pathname === href || pathname.startsWith(href + "/");

/** Items of a role, with every tab group the role can open on more than one page folded into one sidebar entry. */
function collapse(items: NavItem[]): NavItem[] {
  const members = new Map<TabGroupId, NavItem[]>();
  for (const item of items) if (item.tabGroup) members.set(item.tabGroup, [...(members.get(item.tabGroup) ?? []), item]);
  return items.flatMap((item) => {
    if (!item.tabGroup) return [item];
    const group = members.get(item.tabGroup)!;
    if (group[0] !== item) return [];
    if (group.length === 1) return [item];
    // The folded entry opens the first page; its shortcut would mislead, so it is dropped.
    const { label, icon } = TAB_GROUPS[item.tabGroup];
    return [{ ...item, label, icon, shortcut: undefined, match: group.map((m) => m.href) }];
  });
}

export function filterNavForRole(role: AppRole): NavGroup[] {
  // Students only see the separate student portal.
  if (role === "STUDENT") return STUDENT_NAV;
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: collapse(group.items.filter((item) => !item.roles || item.roles.includes(role))),
  })).filter((group) => group.items.length > 0);
}

/** Every page a role may open from the menu, including pages reached through tabs (used by keyboard shortcuts). */
export function allowedHrefsForRole(role: AppRole) {
  if (role === "STUDENT") return [];
  return filterNavForRole(role).flatMap((g) => g.items.flatMap((i) => i.match ?? [i.href]));
}

/** Longest sidebar entry covering the path, so nested pages light up their parent. */
export function activeHrefFor(pathname: string, role: AppRole) {
  let best: { href: string; length: number } | undefined;
  for (const item of filterNavForRole(role).flatMap((g) => g.items)) {
    for (const href of item.match ?? [item.href]) {
      if (onPath(pathname, href) && href.length > (best?.length ?? -1)) best = { href: item.href, length: href.length };
    }
  }
  return best?.href;
}

/** The sibling pages to show as tabs for the path, or null when the page stands alone for this role. */
export function tabsForPath(pathname: string, role: AppRole): NavItem[] | null {
  if (role === "STUDENT") return null;
  const visible = NAV_GROUPS.flatMap((g) => g.items).filter((i) => i.tabGroup && (!i.roles || i.roles.includes(role)));
  const hit = visible.filter((i) => onPath(pathname, i.href)).sort((a, b) => b.href.length - a.href.length)[0];
  const tabs = hit ? visible.filter((i) => i.tabGroup === hit.tabGroup) : [];
  return tabs.length > 1 ? tabs : null;
}
