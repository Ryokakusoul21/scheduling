"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { useTheme } from "@/lib/theme/theme-provider";
import { Menu, Moon, Sun, Laptop, LogOut, User as UserIcon, Bell } from "lucide-react";
import { GlobalSearch } from "./global-search";

import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { filterNavForRole } from "./nav-config";
import type { AppRole } from "@/lib/permissions/roles";
import Link from "next/link";
import { roleLabel } from "@/lib/permissions/roles";

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function Topbar({
  name,
  email,
  role,
  unreadNotifications = 0,
}: {
  name: string;
  email: string;
  role: AppRole;
  unreadNotifications?: number;
}) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const groups = filterNavForRole(role);

  return (
    <header className="flex min-h-16 shrink-0 flex-wrap items-center justify-between gap-3 border-b border-black/10 bg-card px-4 py-2 md:flex-nowrap md:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger render={<Button variant="ghost" size="icon" className="md:hidden" />}>
            <Menu className="size-5" />
          </SheetTrigger>
          <SheetContent side="left" className="w-72 bg-sidebar p-0 text-sidebar-foreground">
            <nav className="space-y-4 overflow-y-auto p-4">
              {groups.map((group, i) => (
                <div key={i}>
                  {group.label && (
                    <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/45">
                      {group.label}
                    </p>
                  )}
                  <ul className="space-y-0.5">
                    {group.items.map((item) => (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          onClick={() => setOpen(false)}
                          className="flex items-center gap-3 rounded-md px-2.5 py-2 text-sm font-medium hover:bg-sidebar-accent"
                        >
                          <item.icon className="size-4" />
                          {item.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </nav>
          </SheetContent>
        </Sheet>

        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold tracking-tight">Scheduling Management System</h1>
          <p className="hidden truncate text-xs text-muted-foreground sm:block">
            Smarter Scheduling. Better Learning. Greater Efficiency.
          </p>
        </div>
      </div>

      <div className="order-3 w-full md:order-none md:max-w-sm md:flex-1">
        <GlobalSearch />
      </div>

      <div className="flex items-center gap-1.5">
        <Link href="/notifications">
          <Button variant="ghost" size="icon" className="relative">
            <Bell className="size-5" />
            {unreadNotifications > 0 && (
              <span className="absolute right-1.5 top-1.5 flex size-2 rounded-full bg-destructive" />
            )}
          </Button>
        </Link>

        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon" />}>
            {theme === "dark" ? (
              <Moon className="size-5" />
            ) : theme === "light" ? (
              <Sun className="size-5" />
            ) : (
              <Laptop className="size-5" />
            )}
          </DropdownMenuTrigger>
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
            render={<button className="ml-1 flex items-center gap-2.5 rounded-full pr-1 outline-none hover:bg-accent" />}
          >
            <Avatar className="size-9">
              <AvatarFallback className="bg-primary text-xs font-semibold text-primary-foreground">
                {initials(name)}
              </AvatarFallback>
            </Avatar>
            <div className="hidden text-left leading-tight lg:block">
              <p className="text-sm font-medium">{name.split(" ")[0]}</p>
              <p className="text-[11px] text-muted-foreground">{roleLabel(role)}</p>
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
  );
}
