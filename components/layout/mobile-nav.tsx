"use client";

import Link from "next/link";
import { useState } from "react";
import { SignOutConfirmation } from "@/components/auth/sign-out-confirmation";
import { DotsThree, SignOut } from "@phosphor-icons/react/ssr";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { UserAvatar } from "@/components/ui/user-avatar";
import { cn } from "@/lib/utils";
import { activeHrefFor, filterNavForRole, mobileNavForRole } from "./nav-config";
import { usePathname } from "next/navigation";
import type { AppRole } from "@/lib/permissions/roles";

const SHORT_LABELS: Record<string, string> = {
  "/dashboard": "Dashboard", "/programs": "Records", "/admin/review-center": "Approvals",
  "/calendar": "Calendar", "/analytics": "Analytics", "/assignment-approvals": "Approvals",
  "/scheduler": "Timetable", "/requests": "Requests", "/student": "Home",
  "/student/schedule": "Timetable", "/student/calendar": "Calendar", "/student/profile": "Profile",
};

/** Bottom navigation for phones: the first pages as icons, and every page in the "More pages" sheet. */
export function MobileNav({ role, name, image, roleLabel }: { role: AppRole; name: string; image?: string | null; roleLabel: string }) {
  const [open, setOpen] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const items = filterNavForRole(role).flatMap((g) => g.items);
  const activeHref = activeHrefFor(usePathname(), role);
  const bar = mobileNavForRole(role);
  const moreActive = !!activeHref && !bar.some((i) => i.href === activeHref);
  const student = role === "STUDENT";

  return (
    <>
      <nav aria-label="Main navigation" className="fixed inset-x-0 bottom-0 z-40 grid h-[calc(4.5rem+env(safe-area-inset-bottom))] grid-cols-5 items-center gap-1 border-t bg-card px-2 pb-[env(safe-area-inset-bottom)] text-muted-foreground shadow-[0_-4px_20px_rgba(15,23,42,0.04)] md:hidden print:hidden">
        {bar.map((item) => {
          const active = item.href === activeHref;
          return (
            <Link key={item.href} href={item.href} aria-label={item.label} aria-current={active ? "page" : undefined}
              className={cn("flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring", active ? "bg-primary/10 text-primary" : "hover:bg-muted hover:text-foreground")}>
              <item.icon className="size-5" weight={active ? "fill" : "regular"} />
              <span className={cn("text-[11px] leading-tight", active && "font-semibold")}>{SHORT_LABELS[item.href] ?? item.label}</span>
            </Link>
          );
        })}
        <button type="button" onClick={() => setOpen(true)} aria-label="More pages" aria-expanded={open}
          className={cn("flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring", moreActive && "bg-primary/10 text-primary")}>
          <DotsThree className="size-6" weight="bold" />
          <span className="text-[11px] leading-tight">More</span>
        </button>
      </nav>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="max-h-[85dvh] gap-0 rounded-t-3xl p-0">
          <div className="border-b px-5 py-4">
            <SheetTitle className="text-lg font-semibold">More pages</SheetTitle>
          </div>
          <ul className="grid grid-cols-3 gap-1 overflow-y-auto p-3">
            {items.map((item) => {
              const active = item.href === activeHref;
              return (
                <li key={item.href}>
                  <Link href={item.href} onClick={() => setOpen(false)} aria-current={active ? "page" : undefined}
                    className={cn("flex h-full flex-col items-center gap-1.5 rounded-xl px-1 py-3 text-center text-xs font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
                      active && "bg-primary/10 text-primary")}>
                    <item.icon className="size-6" weight={active ? "fill" : "regular"} />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className="border-t p-3">
            <div className="flex items-center gap-3 rounded-2xl border p-3">
              <UserAvatar name={name} image={image} small className="size-10" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{name}</p>
                <p className="truncate text-xs text-muted-foreground">{roleLabel}</p>
              </div>
              <button type="button" aria-label={student ? "Sign out" : "Log out"}
                onClick={() => setConfirmLogout(true)}
                className="flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">
                <SignOut className="size-5" />
              </button>
            </div>
          </div>
          <SignOutConfirmation open={confirmLogout} onOpenChange={setConfirmLogout} callbackUrl={student ? "/student/login" : "/login"} />
        </SheetContent>
      </Sheet>
    </>
  );
}
