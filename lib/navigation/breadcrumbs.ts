import type { AppRole } from "@/lib/permissions/roles";

export interface BreadcrumbItem {
  label: string;
  href?: string;
  home?: boolean;
}

const PAGE_LABELS: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/scheduler": "Class Schedules",
  "/examinations": "Examination Schedules",
  "/calendar": "Calendar of Activities",
  "/calendar/proposals": "School Activity Proposals",
  "/bookings": "Room Booking",
  "/adjustments": "Schedule Adjustments",
  "/constraints": "Scheduling Constraints",
  "/requests": "Schedule Requests",
  "/assistant": "Scheduling Assistant",
  "/availability": "Report Unavailability",
  "/academic-years": "Academic Years and Terms",
  "/programs": "Programs and Strands",
  "/subjects": "Subjects",
  "/sections": "Sections",
  "/faculty": "Faculty",
  "/rooms": "Rooms",
  "/import": "Bulk Data Import",
  "/analytics": "Timetable Analytics",
  "/workload": "Faculty Workload",
  "/reports": "Schedule Reports",
  "/notifications": "Notifications",
  "/profile": "Profile and Security",
  "/admin/review-center": "Registrar Review Center",
  "/admin/users": "User Management",
  "/admin/users/archived": "Archived Records",
  "/admin/audit-logs": "Audit Logs",
  "/admin/settings": "System Settings",
  "/student": "Student Dashboard",
  "/student/schedule": "My Schedule",
  "/student/subjects": "Subjects",
  "/student/rooms": "Rooms",
  "/student/calendar": "Calendar of Activities",
  "/student/notifications": "Notifications",
  "/student/profile": "Profile",
};

const QUEUE_LABELS: Record<string, string> = {
  "room-bookings": "Room Booking Requests",
  adjustments: "Schedule Adjustments",
  "schedule-requests": "Schedule Requests",
  "activity-proposals": "Activity Proposals",
  examinations: "Examination Schedules",
  workload: "Workload Fixes",
  "change-requests": "Change Requests",
  "class-schedules": "Class Schedules",
};

const LEVEL_LABELS: Record<string, string> = {
  ELEMENTARY: "Elementary School",
  JUNIOR_HIGH: "Junior High School",
  SENIOR_HIGH: "Senior High School",
  COLLEGE: "College",
};

const CONTEXTUAL = new Set(["/scheduler", "/examinations", "/calendar", "/calendar/proposals", "/requests", "/adjustments", "/workload", "/analytics", "/reports"]);

function parentTrail(pathname: string): BreadcrumbItem[] {
  if (pathname === "/calendar/proposals") return [{ label: PAGE_LABELS["/calendar"], href: "/calendar" }];
  if (pathname === "/admin/users/archived") return [{ label: PAGE_LABELS["/admin/users"], href: "/admin/users" }];
  if (/^\/academic-years\/[^/]+$/.test(pathname)) return [{ label: PAGE_LABELS["/academic-years"], href: "/academic-years" }];
  if (/^\/programs\/[^/]+$/.test(pathname)) return [{ label: PAGE_LABELS["/programs"], href: "/programs" }];
  if (/^\/rooms\/[^/]+$/.test(pathname)) return [{ label: PAGE_LABELS["/rooms"], href: "/rooms" }];
  return [];
}

function pageLabel(pathname: string) {
  if (PAGE_LABELS[pathname]) return PAGE_LABELS[pathname];
  if (/^\/academic-years\/[^/]+$/.test(pathname)) return "Academic Year Details";
  if (/^\/programs\/[^/]+$/.test(pathname)) return "Program Details";
  if (/^\/rooms\/[^/]+$/.test(pathname)) return "Building Details";
  return pathname.split("/").filter(Boolean).at(-1)?.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) ?? "Page";
}

/** Builds a role-safe trail from the current URL. Department context comes from the authenticated user unless the viewer is a Registrar. */
export function buildBreadcrumbs(pathname: string, query: URLSearchParams, role: AppRole, ownDepartmentName?: string | null): BreadcrumbItem[] {
  const homeHref = role === "STUDENT" ? "/student" : "/dashboard";
  const homeLabel = role === "STUDENT" ? "Student Dashboard" : "Dashboard";
  if (pathname === homeHref) return [{ label: homeLabel, home: true }];

  const items: BreadcrumbItem[] = [{ label: homeLabel, href: homeHref, home: true }, ...parentTrail(pathname)];
  const currentLabel = pageLabel(pathname);
  const context: BreadcrumbItem[] = [];
  const level = query.get("level");
  if (level && LEVEL_LABELS[level]) context.push({ label: LEVEL_LABELS[level], href: `${pathname}?level=${encodeURIComponent(level)}` });
  const department = (role === "SUPER_ADMINISTRATOR" || role === "REGISTRAR") ? query.get("department") : ownDepartmentName;
  if (department && CONTEXTUAL.has(pathname)) context.push({ label: department, href: pathname });

  if (pathname === "/admin/review-center" && query.get("queue")) {
    items.push({ label: currentLabel, href: pathname });
    items.push(...context, { label: QUEUE_LABELS[query.get("queue")!] ?? "Review Queue" });
    return items;
  }
  if (pathname === "/calendar/proposals" && query.get("proposal")) {
    items.push({ label: currentLabel, href: pathname }, ...context, { label: "Proposal Details" });
    return items;
  }
  items.push(...context, { label: currentLabel });
  return items;
}