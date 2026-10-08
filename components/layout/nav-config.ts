import type { AppRole } from "@/lib/permissions/roles";
import type { Icon } from "@phosphor-icons/react";
import {
  SquaresFour as LayoutDashboard,
  CalendarDots as CalendarClock,
  ClipboardText as ClipboardList,
  CalendarBlank as CalendarDays,
  BookOpen,
  Stack as Layers,
  Users,
  UserSquare as UserSquare2,
  Buildings as Building2,
  ChartBar as BarChart3,
  ChartPie as PieChart,
  Bell,
  ClockCounterClockwise as History,
  Gear as Settings,
  Robot as Bot,
  UsersThree,
} from "@phosphor-icons/react/ssr";

export interface NavItem {
  label: string;
  href: string;
  icon: Icon;
  roles?: AppRole[];
  /** Keyboard shortcut hint shown in the sidebar tooltip (handled by ShortcutProvider). */
  shortcut?: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

const STAFF: AppRole[] = ["SUPER_ADMIN", "ADMINISTRATOR", "REGISTRAR", "SCHEDULER"];
const ADMIN: AppRole[] = ["SUPER_ADMIN", "ADMINISTRATOR"];

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
      { label: "Schedule Requests", href: "/requests", icon: ClipboardList },
      { label: "AI Assistant", href: "/assistant", icon: Bot },
    ],
  },
  {
    label: "Academic Setup",
    items: [
      { label: "Academic Years & Terms", href: "/academic-years", icon: CalendarDays, roles: STAFF, shortcut: "g y" },
      { label: "Programs & Strands", href: "/programs", icon: Layers, roles: STAFF, shortcut: "g p" },
      { label: "Subjects", href: "/subjects", icon: BookOpen, roles: STAFF, shortcut: "g u" },
      { label: "Sections", href: "/sections", icon: UsersThree, roles: STAFF, shortcut: "g e" },
      { label: "Faculty", href: "/faculty", icon: UserSquare2, roles: STAFF, shortcut: "g f" },
      { label: "Rooms", href: "/rooms", icon: Building2, roles: STAFF, shortcut: "g r" },
    ],
  },
  {
    label: "Reports & Analytics",
    items: [
      { label: "Schedule Reports", href: "/reports", icon: BarChart3, roles: STAFF },
      { label: "Faculty Workload", href: "/reports/faculty-workload", icon: BarChart3, roles: STAFF },
      { label: "Room Utilization", href: "/reports/room-utilization", icon: PieChart, roles: STAFF },
      { label: "Analytics", href: "/analytics", icon: BarChart3, roles: STAFF },
    ],
  },
  {
    label: "Administration",
    items: [
      { label: "User Management", href: "/admin/users", icon: Users, roles: ADMIN },
      { label: "Audit Logs", href: "/admin/audit-logs", icon: History, roles: ADMIN },
      { label: "System Settings", href: "/admin/settings", icon: Settings, roles: ADMIN },
    ],
  },
];

export function filterNavForRole(role: AppRole): NavGroup[] {
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.roles || item.roles.includes(role)),
  })).filter((group) => group.items.length > 0);
}

export function allowedHrefsForRole(role: AppRole) {
  return filterNavForRole(role).flatMap((g) => g.items.map((i) => i.href));
}
