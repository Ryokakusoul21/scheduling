"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { DotsThree, SignOut } from "@phosphor-icons/react/ssr";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { UserAvatar } from "@/components/ui/user-avatar";
import { cn } from "@/lib/utils";
import { activeHrefFor, filterNavForRole } from "./nav-config";
import { usePathname } from "next/navigation";
import type { AppRole } from "@/lib/permissions/roles";

const BAR_ITEMS = 4;

/** Bottom navigation for phones: the first pages as icons, and every page in the "More pages" sheet. */
export function MobileNav({ role, name, image, roleLabel }: { role: AppRole; name: string; image?: string | null; roleLabel: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const items = filterNavForRole(role).flatMap((g) => g.items);
  const activeHref = activeHrefFor(usePathname(), role);
  const bar = items.slice(0, BAR_ITEMS);
  const moreActive = !bar.some((i) => i.href === activeHref);
  const student = role === "STUDENT";

  return (
    <>
      <nav aria-label="Main navigation" className="fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-40 flex h-16 items-center justify-around rounded-2xl bg-sidebar px-2 text-sidebar-foreground shadow-lg md:hidden print:hidden">
        {bar.map((item) => {
          const active = item.href === activeHref;
          return (
            <Link key={item.href} href={item.href} aria-label={item.label} aria-current={active ? "page" : undefined}
              className="relative flex w-16 flex-col items-center outline-none focus-visible:ring-2 focus-visible:ring-brand-gold">
              <span className={cn("flex items-center justify-center rounded-full transition-all duration-300",
                active ? "-mt-9 size-16 bg-background text-primary shadow-md ring-4 ring-sidebar" : "size-10 border border-white/20")}>
                <item.icon className={active ? "size-6" : "size-5"} weight={active ? "fill" : "regular"} />
              </span>
              {active && <span className="mt-0.5 max-w-20 truncate text-[11px] font-semibold">{item.label}</span>}
            </Link>
          );
        })}
        <button type="button" onClick={() => setOpen(true)} aria-label="More pages" aria-expanded={open}
          className={cn("flex size-10 items-center justify-center rounded-full border border-white/20 outline-none focus-visible:ring-2 focus-visible:ring-brand-gold", moreActive && "bg-white/15")}>
          <DotsThree className="size-6" weight="bold" />
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
                onClick={() => signOut({ callbackUrl: student ? "/student/login" : "/login" }).then(() => router.refresh())}
                className="flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">
                <SignOut className="size-5" />
              </button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
