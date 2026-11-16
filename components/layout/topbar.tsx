"use client";

import { useState } from "react";
import { SignOutConfirmation } from "@/components/auth/sign-out-confirmation";
import { flushSync } from "react-dom";
import { useTheme } from "@/lib/theme/theme-provider";
import { Moon, Sun, SignOut as LogOut, User as UserIcon, Keyboard } from "@phosphor-icons/react/ssr";
import { useShortcuts } from "@/components/ux/shortcuts";
import { GlobalSearch } from "./global-search";
import { NotificationsMenu } from "./notifications-menu";

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
  userId,
  name,
  email,
  image,
  role,
  unreadNotifications = 0,
  subtitle,
}: {
  userId: string;
  name: string;
  email: string;
  image?: string | null;
  role: AppRole;
  unreadNotifications?: number;
  /** Secondary line under the name in the account menu, for example the student number. */
  subtitle?: string;
}) {
  const [confirmLogout, setConfirmLogout] = useState(false);
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
  // Students have their own workspace and account pages, without a notification inbox.
  const student = role === "STUDENT";
  const home = student ? "/student" : "";

  return (
    <TooltipProvider>
    <header className="flex min-h-16 shrink-0 flex-wrap items-center justify-between gap-3 border-b border-black/10 bg-card px-4 py-2 md:flex-nowrap md:px-6">

      {student ? (
        <div className="min-w-0"><p className="text-sm font-semibold">Student workspace</p><p className="hidden text-xs text-muted-foreground sm:block">Granby Colleges of Science and Technology</p></div>
      ) : (
        <div className="min-w-0 flex-1 md:max-w-md">
          <GlobalSearch />
        </div>
      )}

      <div className="ml-auto flex shrink-0 items-center gap-1.5 max-md:[&_button]:min-h-11 max-md:[&_button]:min-w-11">
        {!student && <Tooltip>
          <TooltipTrigger
            render={<Button variant="ghost" size="icon" className="hidden size-9 md:inline-flex" aria-label="Keyboard shortcuts" aria-keyshortcuts="?" onClick={openHelp} />}
          >
            <Keyboard className="size-5" />
          </TooltipTrigger>
          <TooltipContent>Keyboard shortcuts (?)</TooltipContent>
        </Tooltip>}
        {!student && <NotificationsMenu unread={unreadNotifications} allHref="/notifications" userId={userId} />}

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
          <DropdownMenuContent align="end" className="w-56" finalFocus={confirmLogout ? false : undefined}>
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
              onClick={() => setConfirmLogout(true)}
            >
              <LogOut className="size-4" /> {student ? "Sign out" : "Log out"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
    <SignOutConfirmation open={confirmLogout} onOpenChange={setConfirmLogout} callbackUrl={student ? "/student/login" : "/login"} />
    </TooltipProvider>
  );
}
