"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { SignOutConfirmation } from "@/components/auth/sign-out-confirmation";
import { ArrowUpRight, SignOut } from "@phosphor-icons/react/ssr";
import { STUDENT_NAV, activeHrefFor } from "@/components/layout/nav-config";
import { UserAvatar } from "@/components/ui/user-avatar";
import { cn } from "@/lib/utils";

const MOBILE_LABELS: Record<string, string> = { "/student": "Home", "/student/schedule": "Timetable", "/student/calendar": "Activities", "/student/profile": "Profile" };

export function StudentNavigation({ name, image, studentNumber }: { name: string; image?: string | null; studentNumber?: string }) {
  const active = activeHrefFor(usePathname(), "STUDENT");
  const [confirmLogout, setConfirmLogout] = useState(false);
  return <>
    <aside className="hidden w-60 shrink-0 flex-col border-r bg-card md:flex print:hidden">
      <Link href="/student" className="flex items-center gap-3 border-b px-5 py-6 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
        <Image src="/branding/logo.jpg" alt="Granby Colleges seal" width={44} height={44} className="shrink-0 rounded-full" />
        <div><p className="text-sm font-bold tracking-tight">GRANBY COLLEGES</p><p className="mt-1 text-[10px] font-semibold tracking-[0.15em] text-brand-link">STUDENT PORTAL</p></div>
      </Link>
      <nav aria-label="Student navigation" className="flex-1 space-y-7 overflow-y-auto px-3 py-7">
        {STUDENT_NAV.map((group) => <div key={group.label}>
          <p className="mb-3 px-3 text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">{group.label}</p>
          <ul className="space-y-1.5">{group.items.map((item) => <li key={item.href}>
            <Link href={item.href} aria-current={active === item.href ? "page" : undefined}
              className={cn("flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring", active === item.href ? "bg-brand-blue text-white shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
              <item.icon aria-hidden className="size-5 shrink-0" weight={active === item.href ? "fill" : "regular"} />{item.label}
            </Link>
          </li>)}</ul>
        </div>)}
      </nav>
      <div className="m-4 rounded-xl border bg-muted/30 p-3">
        <Link href="/student/profile" className="flex items-center gap-2.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <UserAvatar name={name} image={image} small className="size-9 shrink-0" />
          <div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">{name}</p><p className="mt-1 truncate text-[11px] text-muted-foreground">{studentNumber || "Student account"}</p></div>
          <ArrowUpRight aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
        </Link>
        <button type="button" onClick={() => setConfirmLogout(true)}
          className="mt-3 flex min-h-10 w-full items-center gap-2 rounded-lg border-t px-1 text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"><SignOut aria-hidden className="size-4" />Sign out</button>
      </div>
    </aside>
    <nav aria-label="Student navigation" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t bg-card px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:hidden print:hidden">
      {STUDENT_NAV[0].items.map((item) => <Link key={item.href} href={item.href} aria-current={active === item.href ? "page" : undefined}
        className={cn("flex min-h-12 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[10px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring", active === item.href ? "bg-brand-blue/10 text-brand-link" : "text-muted-foreground")}>
        <item.icon aria-hidden className="size-5" weight={active === item.href ? "fill" : "regular"} />{MOBILE_LABELS[item.href]}
      </Link>)}
    </nav>
    <SignOutConfirmation open={confirmLogout} onOpenChange={setConfirmLogout} callbackUrl="/student/login" />
  </>;
}
