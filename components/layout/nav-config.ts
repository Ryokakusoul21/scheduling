import type { AppRole } from "@/lib/permissions/roles";
import {
  LayoutDashboard,
  Sparkles,
  CalendarClock,
  AlertTriangle,
  ClipboardList,
  CalendarDays,
  GraduationCap,
  BookOpen,
  Layers,
  Users,
  UserSquare2,
  Building2,
  BarChart3,
  PieChart,
  Bell,
  History,
  Settings,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  roles?: AppRole[];
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

const STAFF: AppRole[] = ["SUPER_ADMIN", "ADMINISTRATOR", "REGISTRAR", "SCHEDULER"];
const SCHEDULING: AppRole[] = ["SUPER_ADMIN", "ADMINISTRATOR", "SCHEDULER"];
const ADMIN: AppRole[] = ["SUPER_ADMIN", "ADMINISTRATOR"];

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "",
    items: [{ label: "Dashboard", href: "/dashboard", icon: LayoutDashboard }],
  },
  {
    label: "AI & Scheduling",
    items: [
      { label: "AI Auto Scheduler", href: "/ai-scheduler", icon: Sparkles, roles: SCHEDULING },
      { label: "Schedule Manager", href: "/schedules", icon: CalendarClock, roles: STAFF },
      { label: "Conflict Resolution", href: "/conflicts", icon: AlertTriangle, roles: STAFF },
      { label: "Schedule Requests", href: "/requests", icon: ClipboardList },
      { label: "Schedule Calendar", href: "/calendar", icon: CalendarDays },
    ],
  },
  {
    label: "Academic Management",
    items: [
      { label: "Academic Years", href: "/academic-years", icon: CalendarDays, roles: STAFF },
      { label: "Semesters", href: "/semesters", icon: CalendarDays, roles: STAFF },
      { label: "Programs", href: "/programs", icon: Layers, roles: STAFF },
      { label: "Subjects", href: "/subjects", icon: BookOpen, roles: STAFF },
      { label: "Sections", href: "/sections", icon: Layers, roles: STAFF },
      { label: "Students", href: "/students", icon: GraduationCap, roles: STAFF },
      { label: "Faculty", href: "/faculty", icon: UserSquare2, roles: STAFF },
      { label: "Rooms", href: "/rooms", icon: Building2, roles: STAFF },
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
      { label: "Notifications", href: "/notifications", icon: Bell },
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
