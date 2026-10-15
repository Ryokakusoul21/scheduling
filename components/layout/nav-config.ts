import { TEACHING_ROLES, type AppRole } from "@/lib/permissions/roles";
import type { Icon } from "@phosphor-icons/react";
import {
  SquaresFour as LayoutDashboard,
  CalendarDots as CalendarClock,
  CalendarCheck,
  ClipboardText as ClipboardList,
  CalendarBlank as CalendarDays,
  BookOpen,
  Stack as Layers,
  Users,
  UserSquare as UserSquare2,
  UserMinus,
  Buildings as Building2,
  ChartBar as BarChart3,
  ChartLineUp,
  Bell,
  ClockCounterClockwise as History,
  Gear as Settings,
  Robot as Bot,
  UsersThree,
  Exam,
  DoorOpen,
  ArrowsClockwise,
  Gauge,
  UploadSimple,
  ShieldCheck,
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

const STAFF: AppRole[] = ["ADMINISTRATOR", "HEAD_OF_DEPARTMENT"];
const ADMIN: AppRole[] = ["ADMINISTRATOR"];

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
      { label: "Examinations", href: "/examinations", icon: Exam, shortcut: "g x" },
      { label: "Room Booking", href: "/bookings", icon: DoorOpen, shortcut: "g b" },
      { label: "Schedule Adjustments", href: "/adjustments", icon: ArrowsClockwise, roles: STAFF },
      { label: "Scheduling Constraints", href: "/constraints", icon: ShieldCheck, roles: STAFF },
      { label: "Schedule Requests", href: "/requests", icon: ClipboardList },
      { label: "Scheduling Assistant", href: "/assistant", icon: Bot },
    ],
  },
  {
    label: "My Teaching",
    items: [
      { label: "My Teaching Load", href: "/workload", icon: Gauge, roles: ["FACULTY"] },
      { label: "Report Unavailability", href: "/availability", icon: UserMinus, roles: TEACHING_ROLES },
    ],
  },
  {
    label: "Academic Setup",
    items: [
      { label: "Academic Years & Terms", href: "/academic-years", icon: CalendarDays, roles: ADMIN, shortcut: "g y" },
      { label: "Programs & Strands", href: "/programs", icon: Layers, roles: STAFF, shortcut: "g p" },
      { label: "Subjects", href: "/subjects", icon: BookOpen, roles: STAFF, shortcut: "g u" },
      { label: "Sections", href: "/sections", icon: UsersThree, roles: STAFF, shortcut: "g e" },
      { label: "Faculty", href: "/faculty", icon: UserSquare2, roles: STAFF, shortcut: "g f" },
      { label: "Rooms", href: "/rooms", icon: Building2, roles: STAFF, shortcut: "g r" },
      { label: "Bulk Data Import", href: "/import", icon: UploadSimple, roles: STAFF },
    ],
  },
  {
    label: "Reports & Analytics",
    items: [
      { label: "Timetable Analytics", href: "/analytics", icon: BarChart3, roles: STAFF },
      { label: "Faculty Workload", href: "/workload", icon: Gauge, roles: STAFF },
      { label: "Enrollment Forecast", href: "/forecast", icon: ChartLineUp, roles: STAFF },
      { label: "Schedule Reports", href: "/reports", icon: BarChart3, roles: STAFF },
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
  // Students only use the separate student portal.
  if (role === "STUDENT") return [];
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.roles || item.roles.includes(role)),
  })).filter((group) => group.items.length > 0);
}

export function allowedHrefsForRole(role: AppRole) {
  return filterNavForRole(role).flatMap((g) => g.items.map((i) => i.href));
}
