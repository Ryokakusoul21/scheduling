"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { useTheme } from "@/lib/theme/theme-provider";
import { List as Menu, Moon, Sun, Laptop, SignOut as LogOut, User as UserIcon, Bell, Keyboard } from "@phosphor-icons/react/ssr";
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
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { NavGroups } from "./sidebar";
import type { AppRole } from "@/lib/permissions/roles";
import Link from "next/link";
import { roleLabel } from "@/lib/permissions/roles";

export function Topbar({
  name,
  email,
  image,
  role,
  unreadNotifications = 0,
}: {
  name: string;
  email: string;
  image?: string | null;
  role: AppRole;
  unreadNotifications?: number;
}) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const themeLabel = `Theme: ${theme === "dark" ? "Dark" : theme === "light" ? "Light" : "System"}`;
  const { openHelp } = useShortcuts();

  return (
    <TooltipProvider>
    <header className="flex min-h-16 shrink-0 flex-wrap items-center justify-between gap-3 border-b border-black/10 bg-card px-4 py-2 md:flex-nowrap md:px-6">
      <div className="flex min-w-0 items-center gap-3 md:hidden">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger render={<Button variant="ghost" size="icon" className="md:hidden" aria-label="Open navigation" />}>
            <Menu className="size-5" />
          </SheetTrigger>
          <SheetContent side="left" className="w-72 bg-sidebar p-0 text-sidebar-foreground">
            <div className="sidebar-scroll h-full overflow-y-auto p-4">
              <NavGroups role={role} onNavigate={() => setOpen(false)} />
            </div>
          </SheetContent>
        </Sheet>
      </div>

      <div className="order-3 w-full md:order-none md:max-w-md md:flex-1">
        <GlobalSearch />
      </div>

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
                render={<Link href="/notifications" />}
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

        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger render={<DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="size-9" aria-label={themeLabel} />} />}>
              {theme === "dark" ? <Moon className="size-5" /> : theme === "light" ? <Sun className="size-5" /> : <Laptop className="size-5" />}
            </TooltipTrigger>
            <TooltipContent>{themeLabel}</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setTheme("light")}>
              <Sun className="size-4" /> Light
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme("dark")}>
              <Moon className="size-4" /> Dark
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme("system")}>
              <Laptop className="size-4" /> System
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

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
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem render={<Link href="/profile" />}>
              <UserIcon className="size-4" /> Profile
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={() => signOut({ callbackUrl: "/login" }).then(() => router.refresh())}
            >
              <LogOut className="size-4" /> Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
    </TooltipProvider>
  );
}
