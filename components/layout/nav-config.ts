import { ROOM_BOOKING_ROLES, SCHEDULING_ROLES, TEACHING_ROLES, type AppRole } from "@/lib/permissions/roles";
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
  ClockCounterClockwise as History,
  Gear as Settings,
  UsersThree,
  DoorOpen,
  ArrowsClockwise,
  Prohibit,
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
  setup: { label: "Academic Record", icon: Layers },
  reports: { label: "Reports and Analytics", icon: BarChart3 },
  system: { label: "System Administration", icon: Settings },
};

export interface NavGroup {
  label: string;
  items: NavItem[];
  /** Show a merged workspace directly instead of an extra expandable heading. */
  direct?: boolean;
}

const STAFF: AppRole[] = ["SUPER_ADMINISTRATOR", "REGISTRAR", "HEAD_OF_DEPARTMENT"];
const ADMIN: AppRole[] = ["SUPER_ADMINISTRATOR", "REGISTRAR"];
const SUPER: AppRole[] = ["SUPER_ADMINISTRATOR"];

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, shortcut: "g d" },
    ],
  },
  {
    label: "Scheduling",
    items: [
      { label: "Scheduler", href: "/scheduler", icon: CalendarClock, shortcut: "g s" },
      { label: "Calendar of Activities", href: "/calendar", icon: CalendarCheck, shortcut: "g c" },
      { label: "Room Booking", href: "/bookings", icon: DoorOpen, roles: ROOM_BOOKING_ROLES, shortcut: "g b" },
      { label: "Schedule Adjustments", href: "/adjustments", icon: ArrowsClockwise, roles: SCHEDULING_ROLES, tabGroup: "changes" },
      { label: "Class Suspensions", href: "/suspensions", icon: Prohibit, roles: SCHEDULING_ROLES, tabGroup: "changes" },
      { label: "Schedule Requests", href: "/requests", icon: ClipboardList, roles: TEACHING_ROLES, tabGroup: "changes" },
      { label: "Scheduling Constraints", href: "/constraints", icon: ShieldCheck, roles: SCHEDULING_ROLES, tabGroup: "changes" },
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
      { label: "Academic Programs", href: "/programs", icon: Layers, roles: STAFF, shortcut: "g p", tabGroup: "setup" },
      { label: "Subjects", href: "/subjects", icon: BookOpen, roles: STAFF, shortcut: "g u", tabGroup: "setup" },
      { label: "Subject Assignment Approvals", href: "/assignment-approvals", icon: ShieldCheck, roles: STAFF, tabGroup: "setup" },
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
      { label: "Department Management", href: "/admin/departments", icon: Building2, roles: ["REGISTRAR"], tabGroup: "setup" },
      { label: "Department Profile", href: "/department", icon: Building2, roles: STAFF, tabGroup: "setup" },
      { label: "User Management", href: "/admin/users", icon: Users, roles: SUPER, tabGroup: "system" },
      { label: "Audit Logs", href: "/admin/audit-logs", icon: History, roles: SUPER, tabGroup: "system" },
      { label: "System Settings", href: "/admin/settings", icon: Settings, roles: SUPER, tabGroup: "system" },
      { label: "View as Another Role", href: "/admin/view-as", icon: UserCircle, roles: SUPER, tabGroup: "system" },
    ],
  },
];

/** Student portal navigation; every page lives under /student and is read-only. */
export const STUDENT_NAV: NavGroup[] = [
  {
    label: "Student workspace",
    direct: true,
    items: [
      { label: "Dashboard", href: "/student", icon: LayoutDashboard },
      { label: "My Timetable", href: "/student/schedule", icon: Table },
      { label: "Activities calendar", href: "/student/calendar", icon: CalendarCheck },
      { label: "My profile", href: "/student/profile", icon: UserCircle },
    ],
  },
  {
    label: "Academic Record",
    direct: true,
    items: [
      { label: "My subjects", href: "/student/subjects", icon: BookOpen },
    ],
  },
];

type MenuEntry = string | { href: string; label: string };
interface RoleMenuGroup {
  label: string;
  items: MenuEntry[];
  /** Keep secondary reference pages together in a sidebar entry with page tabs. */
  compact?: boolean;
  direct?: boolean;
}

const ROLE_MENUS: Record<Exclude<AppRole, "STUDENT">, RoleMenuGroup[]> = {
  SUPER_ADMINISTRATOR: [
    {
      label: "School Monitoring",
      items: ["/dashboard", { href: "/analytics", label: "Timetable Analytics" }, { href: "/admin/review-center", label: "Submission Monitoring" }, "/reports", "/workload"],
    },
    {
      label: "School Activity",
      items: [{ href: "/scheduler", label: "School Timetables" }, "/calendar"],
    },
    {
      label: "Academic Record",
      compact: true,
      items: [{ href: "/programs", label: "Programs & Terms" }, "/subjects", "/sections", "/faculty", "/rooms"],
    },
    {
      label: "System Administration",
      items: ["/admin/users", "/admin/audit-logs", "/admin/settings", "/admin/view-as"],
    },
  ],
  REGISTRAR: [
    { label: "Overview", items: ["/dashboard"] },
    {
      label: "Academic Record",
      compact: true,
      direct: true,
      items: [{ href: "/programs", label: "Programs & Terms" }, "/subjects", "/sections", "/faculty", "/rooms", { href: "/admin/departments", label: "Departments" }, { href: "/import", label: "Import" }],
    },
    {
      label: "Schedule Administration",
      items: [{ href: "/admin/review-center", label: "Submission Monitoring" }, { href: "/scheduler", label: "School Timetables" }, "/constraints", "/adjustments", "/suspensions"],
    },
    { label: "Reports", compact: true, items: ["/analytics", "/workload", "/reports"] },
    { label: "School Updates", items: ["/calendar", "/bookings"] },
  ],
  HEAD_OF_DEPARTMENT: [
    { label: "Overview", items: ["/dashboard"] },
    {
      label: "Scheduling",
      items: [{ href: "/scheduler", label: "Timetable" }, "/calendar", { href: "/bookings", label: "Room Bookings" }, "/suspensions", "/constraints"],
    },
    {
      label: "Approvals",
      items: [{ href: "/requests", label: "Requests" }, { href: "/assignment-approvals", label: "Subject Assignments" }, { href: "/adjustments", label: "Unavailability and Changes" }],
    },
    { label: "Academic Record", compact: true, items: [{ href: "/programs", label: "Profile and Programs" }, "/subjects", "/sections", "/faculty", "/rooms"] },
    { label: "Reports and Analytics", compact: true, items: ["/analytics", "/workload", "/reports"] },
    { label: "My Teaching", items: ["/my-subjects", "/availability"] },
  ],
  FACULTY: [
    { label: "My Timetable", items: ["/dashboard", { href: "/scheduler", label: "My Timetable" }] },
    { label: "Requests & Unavailability", items: ["/bookings", { href: "/requests", label: "Request Changes" }, { href: "/availability", label: "Submit Unavailability" }] },
    { label: "My Teaching", items: ["/my-subjects", "/workload"] },
    { label: "Updates", items: ["/calendar"] },
  ],
};

/** Resolve the role's menu against the authorized page catalog, including role-specific labels. */
function menuForRole(role: Exclude<AppRole, "STUDENT">): NavGroup[] {
  const available = NAV_GROUPS.flatMap((group) => group.items).filter((item) => !item.roles || item.roles.includes(role));
  return ROLE_MENUS[role].map((group) => ({
    label: group.label,
    direct: group.direct,
    items: group.items.map((entry) => {
      const href = typeof entry === "string" ? entry : entry.href;
      const item = available.find((candidate) => candidate.href === href);
      if (!item) throw new Error(`No navigation destination for ${role}: ${href}`);
      return {
        ...item,
        label: typeof entry === "string" ? item.label : entry.label,
        match: ADMIN.includes(role) && href === "/programs" ? ["/programs", "/academic-years"] : ADMIN.includes(role) && href === "/admin/review-center" ? ["/admin/review-center", "/assignment-approvals"] : item.match,
        tabGroup: group.compact ? item.tabGroup : undefined,
      };
    }),
  }));
}

export const onPath = (pathname: string, href: string) => pathname === href || pathname.startsWith(href + "/");
export const navMatchesPath = (pathname: string, item: NavItem) => (item.match ?? [item.href]).some((href) => onPath(pathname, href));

/** Items of a role, with every tab group the role can open on more than one page folded into one sidebar entry. */
function collapse(items: NavItem[], label: string): NavItem[] {
  const members = new Map<TabGroupId, NavItem[]>();
  for (const item of items) if (item.tabGroup) members.set(item.tabGroup, [...(members.get(item.tabGroup) ?? []), item]);
  return items.flatMap((item) => {
    if (!item.tabGroup) return [item];
    const group = members.get(item.tabGroup)!;
    if (group[0] !== item) return [];
    if (group.length === 1) return [item];
    // The folded entry opens the first page; its shortcut would mislead, so it is dropped.
    const { icon } = TAB_GROUPS[item.tabGroup];
    return [{ ...item, label, icon, shortcut: undefined, match: group.flatMap((m) => m.match ?? [m.href]) }];
  });
}

export function filterNavForRole(role: AppRole): NavGroup[] {
  if (role === "STUDENT") return STUDENT_NAV;
  return menuForRole(role).map((group) => ({
    ...group,
    items: collapse(group.items, group.label),
  }));
}

/** Frequent mobile destinations, resolved from the role's existing authorized menu. */
export function mobileNavForRole(role: AppRole): NavItem[] {
  const items = filterNavForRole(role).flatMap((group) => group.items);
  const preferred = role === "REGISTRAR" ? ["/dashboard", "/programs", "/admin/review-center", "/calendar"]
    : role === "HEAD_OF_DEPARTMENT" ? ["/dashboard", "/scheduler", "/assignment-approvals", "/calendar"]
    : role === "SUPER_ADMINISTRATOR" ? ["/dashboard", "/analytics", "/admin/review-center", "/calendar"]
    : role === "FACULTY" ? ["/dashboard", "/scheduler", "/requests", "/calendar"]
    : ["/student", "/student/schedule", "/student/calendar", "/student/profile"];
  const selected = preferred.flatMap((href) => {
    const item = items.find((candidate) => candidate.href === href);
    return item ? [item] : [];
  });
  return [...selected, ...items.filter((item) => !selected.some((entry) => entry.href === item.href))].slice(0, 4);
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
  const visible = menuForRole(role).flatMap((g) => g.items).filter((i) => i.tabGroup);
  const hit = visible.filter((i) => navMatchesPath(pathname, i)).sort((a, b) => b.href.length - a.href.length)[0];
  const tabs = hit ? visible.filter((i) => i.tabGroup === hit.tabGroup) : [];
  return tabs.length > 1 ? tabs : null;
}
