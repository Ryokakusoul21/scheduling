import Link from "next/link";
import { ArrowUpRight, CalendarBlank } from "@phosphor-icons/react/ssr";
import type { CSSProperties, ReactNode } from "react";
import { roleLabel, type AppRole } from "@/lib/permissions/roles";

const BRAND_THEME = {
  accent: "var(--brand-blue)",
  tint: "color-mix(in srgb, var(--brand-blue) 15%, white)",
};

const THEMES: Record<AppRole, { accent: string; tint: string; label: string }> = {
  SUPER_ADMINISTRATOR: { ...BRAND_THEME, label: "Administrator dashboard" },
  REGISTRAR: { ...BRAND_THEME, label: "Registrar dashboard" },
  HEAD_OF_DEPARTMENT: { ...BRAND_THEME, label: "Department dashboard" },
  FACULTY: { ...BRAND_THEME, label: "Faculty dashboard" },
  STUDENT: { ...BRAND_THEME, label: "Student dashboard" },
};

export function dashboardTheme(role: AppRole): CSSProperties {
  return {
    "--dashboard-accent": THEMES[role].accent,
    "--dashboard-tint": THEMES[role].tint,
  } as CSSProperties;
}

/** The same photo-and-greeting composition, with an identity and actions for each role. */
export function DashboardBanner({ role, name, date, context, action, href, status }: {
  role: AppRole;
  name: string;
  date: Date;
  context: string;
  action: string;
  href: string;
  status?: ReactNode;
}) {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Manila", hour: "2-digit", hourCycle: "h23" }).format(date));
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const firstName = name.trim().split(/\s+/)[0];
  const calendar = role === "STUDENT" ? "/student/calendar" : "/calendar";

  return (
    <header
      aria-label={THEMES[role].label}
      style={dashboardTheme(role)}
      className="relative isolate flex min-h-[166px] flex-wrap items-end justify-between gap-x-6 gap-y-5 overflow-hidden rounded-[10px] border-t-[3px] border-t-brand-gold bg-[#151319] px-6 py-6 text-white sm:px-7 sm:py-7"
    >
      <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 -z-20 w-full bg-[url('/branding/school.jpg')] bg-cover bg-[center_58%] opacity-60 sm:w-2/3" />
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(90deg,#151319_0%,#151319_32%,rgba(21,19,25,0.88)_47%,rgba(21,19,25,0.15)_100%)]" />
      <div className="min-w-0 space-y-2.5">
        <p className="text-[9px] leading-relaxed font-medium tracking-[0.22em] text-white/75 uppercase">Granby Colleges · {roleLabel(role)}</p>
        <h1 className="font-[Georgia,Times_New_Roman,serif] text-[34px] leading-[1.12] font-normal tracking-tight sm:text-[42px]">{greeting}{firstName ? `, ${firstName}` : ""}.</h1>
        <p className="max-w-2xl text-xs leading-relaxed text-white/75">
          {date.toLocaleDateString("en-PH", { timeZone: "Asia/Manila", weekday: "long", month: "long", day: "numeric", year: "numeric" })}
          <span className="mx-1.5 text-white/40" aria-hidden>·</span>
          {context}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        {status}
        <Link href={calendar} className="inline-flex min-h-9 items-center gap-2 rounded-md border border-white/30 bg-white/10 px-3 text-xs font-medium text-white outline-none hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white"><CalendarBlank className="size-3.5" aria-hidden />Calendar</Link>
        <Link href={href} className="inline-flex min-h-9 items-center gap-2 rounded-md bg-[var(--dashboard-accent)] px-3 text-xs font-medium text-white outline-none hover:brightness-110 focus-visible:ring-2 focus-visible:ring-white">{action}<ArrowUpRight className="size-3.5" aria-hidden /></Link>
      </div>
    </header>
  );
}
