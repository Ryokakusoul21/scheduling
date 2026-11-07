"use client";

import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { flushSync } from "react-dom";
import { useTheme } from "@/lib/theme/theme-provider";
import { Moon, Sun, SignOut as LogOut, User as UserIcon, Bell, Keyboard } from "@phosphor-icons/react/ssr";
import { useShortcuts } from "@/components/ux/shortcuts";
import { GlobalSearch } from "./global-search";

import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/ui/user-avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { AppRole } from "@/lib/permissions/roles";
import Link from "next/link";
import { roleLabel } from "@/lib/permissions/roles";

export function Topbar({
  name,
  email,
  image,
  role,
  unreadNotifications = 0,
  subtitle,
}: {
  name: string;
  email: string;
  image?: string | null;
  role: AppRole;
  unreadNotifications?: number;
  /** Secondary line under the name in the account menu, for example the student number. */
  subtitle?: string;
}) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const dark = theme === "dark";
  const themeLabel = `Switch to ${dark ? "light" : "dark"} mode`;

  // The new theme spreads out in a slow circle from the button that was pressed.
  function toggleTheme(e: React.MouseEvent<HTMLButtonElement>) {
    const next = document.documentElement.classList.contains("dark") ? "light" : "dark";
    const start = (document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void> } }).startViewTransition;
    if (!start || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return setTheme(next);
    const { clientX: x, clientY: y } = e;
    const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    start.call(document, () => flushSync(() => setTheme(next))).ready.then(() =>
      document.documentElement.animate({ clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] }, { duration: 900, easing: "ease-in-out", pseudoElement: "::view-transition-new(root)" }),
    );
  }
  const { openHelp } = useShortcuts();
  // Students stay inside the portal: no staff search, and their own notification, profile, and login pages.
  const student = role === "STUDENT";
  const home = student ? "/student" : "";

  return (
    <TooltipProvider>
    <header className="flex min-h-16 shrink-0 flex-wrap items-center justify-between gap-3 border-b border-black/10 bg-card px-4 py-2 md:flex-nowrap md:px-6">

      {student ? (
        <p className="hidden truncate text-sm font-semibold md:block">GRANBY COLLEGES OF SCIENCE AND TECHNOLOGY</p>
      ) : (
        <div className="order-3 w-full md:order-none md:max-w-md md:flex-1">
          <GlobalSearch />
        </div>
      )}

      <div className="ml-auto flex items-center gap-1.5">
        <Tooltip>
          <TooltipTrigger
            render={<Button variant="ghost" size="icon" className="hidden size-9 sm:inline-flex" aria-label="Keyboard shortcuts" aria-keyshortcuts="?" onClick={openHelp} />}
          >
            <Keyboard className="size-5" />
          </TooltipTrigger>
          <TooltipContent>Keyboard shortcuts (?)</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                className="relative size-9"
                nativeButton={false}
                aria-label={unreadNotifications > 0 ? `Notifications, ${unreadNotifications} unread` : "Notifications"}
                render={<Link href={`${home}/notifications`} />}
              />
            }
          >
            <Bell className="size-5" />
            {unreadNotifications > 0 && (
              <span aria-hidden className="absolute -top-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-danger px-1 text-[11px] leading-none font-semibold text-white ring-2 ring-card">
                {unreadNotifications > 99 ? "99+" : unreadNotifications}
              </span>
            )}
          </TooltipTrigger>
          <TooltipContent>Notifications</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger render={<Button variant="ghost" size="icon" className="size-9" aria-label={themeLabel} onClick={toggleTheme} />}>
            {dark ? <Moon className="size-5" /> : <Sun className="size-5" />}
          </TooltipTrigger>
          <TooltipContent>{themeLabel}</TooltipContent>
        </Tooltip>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={<button aria-label="Account menu" className="ml-1 flex items-center gap-2.5 rounded-full pr-1 outline-none hover:bg-accent" />}
          >
            <UserAvatar name={name} image={image} small className="size-9" />
            <div className="hidden text-left leading-tight lg:block">
              <p className="text-sm font-medium">{name.split(" ")[0]}</p>
              <p className="text-xs text-muted-foreground">{roleLabel(role)}</p>
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <p className="truncate text-sm font-medium">{name}</p>
              <p className="truncate text-xs font-normal text-muted-foreground">{email}</p>
              {subtitle && <p className="truncate text-xs font-normal text-muted-foreground">{subtitle}</p>}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem render={<Link href={`${home}/profile`} />}>
              <UserIcon className="size-4" /> Profile
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={() => signOut({ callbackUrl: student ? "/student/login" : "/login" }).then(() => router.refresh())}
            >
              <LogOut className="size-4" /> {student ? "Sign out" : "Log out"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
    </TooltipProvider>
  );
}
