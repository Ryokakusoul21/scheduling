"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { UserAvatar } from "@/components/ui/user-avatar";
import { useState, useSyncExternalStore } from "react";
import { CaretDoubleLeft as ChevronsLeft, CaretDown, SidebarSimple, SignOut } from "@phosphor-icons/react/ssr";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { activeHrefFor, filterNavForRole } from "./nav-config";
import { useShortcuts } from "@/components/ux/shortcuts";
import type { AppRole } from "@/lib/permissions/roles";

const GROUPS_KEY = "sidebar-closed-groups";

// Closed nav groups live in localStorage; the server render treats every group as open.
function readClosed(): string {
  try {
    const raw = localStorage.getItem(GROUPS_KEY) ?? "[]";
    return Array.isArray(JSON.parse(raw)) ? raw : "[]";
  } catch {
    return "[]";
  }
}
function subscribeClosed(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(GROUPS_KEY, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(GROUPS_KEY, onChange);
  };
}

function useActiveHref(role: AppRole) {
  return activeHrefFor(usePathname(), role);
}

/** Navigation groups that collapse and remember which ones are closed; shared by the sidebar and the mobile drawer. */
export function NavGroups({ role, collapsed = false, onNavigate }: { role: AppRole; collapsed?: boolean; onNavigate?: () => void }) {
  const groups = filterNavForRole(role);
  const activeHref = useActiveHref(role);
  const closed: string[] = JSON.parse(useSyncExternalStore(subscribeClosed, readClosed, () => "[]"));

  function toggle(label: string) {
    const next = closed.includes(label) ? closed.filter((l) => l !== label) : [...closed, label];
    try {
      localStorage.setItem(GROUPS_KEY, JSON.stringify(next));
    } catch {}
    // The storage event only fires in other tabs, so notify this one directly.
    window.dispatchEvent(new Event(GROUPS_KEY));
  }

  return (
    <TooltipProvider>
      <nav aria-label="Main navigation" className="space-y-3">
        {groups.map((group, i) => {
          // The group holding the current page always stays open.
          const open = collapsed || !closed.includes(group.label) || group.items.some((item) => item.href === activeHref);
          const listId = `nav-group-${i}`;
          return (
            <div key={group.label} className={cn(i > 0 && (collapsed ? "mx-2 border-t border-white/15 pt-3" : "border-t border-white/[0.06] pt-3"))}>
              {!collapsed && (
                <button
                  type="button"
                  aria-expanded={open}
                  aria-controls={listId}
                  onClick={() => toggle(group.label)}
                  className="mb-1 flex w-full items-center justify-between rounded-md px-2 py-1 text-xs font-semibold tracking-wider text-sidebar-foreground/60 uppercase hover:text-sidebar-foreground"
                >
                  {group.label}
                  <CaretDown className={cn("size-3.5 transition-transform duration-150", !open && "-rotate-90")} />
                </button>
              )}
              {open && (
                <ul id={listId} className="space-y-0.5">
                  {group.items.map((item) => {
                    const active = item.href === activeHref;
                    const link = (
                      <Link
                        href={item.href}
                        onClick={onNavigate}
                        aria-current={active ? "page" : undefined}
                        aria-keyshortcuts={item.shortcut}
                        aria-label={collapsed ? item.label : undefined}
                        className={cn(
                          "relative flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-brand-gold",
                          collapsed && "mx-auto size-11 justify-center p-0",
                          collapsed && active
                            ? "-mr-3 ml-1.5 w-auto rounded-l-full rounded-r-none bg-background text-primary before:pointer-events-none before:absolute before:-top-5 before:right-0 before:size-5 before:rounded-br-full before:shadow-[8px_8px_0_8px_var(--background)] after:pointer-events-none after:absolute after:-bottom-5 after:right-0 after:size-5 after:rounded-tr-full after:shadow-[8px_-8px_0_8px_var(--background)]"
                            : collapsed
                            ? "rounded-full text-sidebar-foreground/80 hover:bg-white/10 hover:text-white"
                            : active
                            ? "bg-white/[0.12] text-white before:absolute before:inset-y-1.5 before:left-0 before:w-1 before:rounded-r-full before:bg-brand-gold"
                            : "text-sidebar-foreground/75 hover:bg-white/[0.06] hover:text-sidebar-foreground"
                        )}
                      >
                        <item.icon className={cn("size-[18px] shrink-0", active && (collapsed ? "size-5 text-primary" : "text-brand-gold"))} weight={active ? "fill" : "regular"} />
                        {!collapsed && (
                          <span className="truncate" title={item.label}>
                            {item.label}
                          </span>
                        )}
                      </Link>
                    );
                    return (
                      <li key={item.href}>
                        {collapsed ? (
                          <Tooltip>
                            <TooltipTrigger render={link} />
                            <TooltipContent side="right">
                              {item.label}
                              {item.shortcut && <span className="opacity-70">({item.shortcut})</span>}
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          link
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </nav>
    </TooltipProvider>
  );
}

export function Sidebar({ role, name, image }: { role: AppRole; name: string; image?: string | null }) {
  const [collapsed, setCollapsed] = useState(false);
  const { openHelp } = useShortcuts();
  const router = useRouter();
  const student = role === "STUDENT";
  const toggle = (
    <button
      type="button"
      aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      aria-expanded={!collapsed}
      onClick={() => setCollapsed((c) => !c)}
      className={cn(
        "flex shrink-0 items-center justify-center gap-2 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-brand-gold focus-visible:outline-none",
        collapsed ? "size-11 rounded-full border border-white/25 hover:bg-white/10" : "border-t border-black/10 px-4 py-3 hover:bg-white/[0.06]"
      )}
    >
      {collapsed ? <SidebarSimple className="size-5" /> : <ChevronsLeft className="size-4" />}
      {!collapsed && "Collapse"}
    </button>
  );
  const logo = (
    <div className="relative flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white ring-2 ring-brand-gold/60">
      <Image src="/branding/logo.jpg" alt="GRANBY COLLEGES OF SCIENCE AND TECHNOLOGY Seal" fill sizes="44px" className="object-cover" />
    </div>
  );

  // Collapsed: a floating rounded rail of icons where the current page joins the content as a tab.
  if (collapsed) {
    return (
      <aside className="hidden w-[92px] shrink-0 p-2.5 md:flex print:hidden">
        <div className="flex w-full flex-col items-center gap-3 overflow-hidden rounded-[2.25rem] bg-gradient-to-b from-sidebar via-sidebar to-[oklch(0.12_0.05_264)] py-4 text-sidebar-foreground shadow-lg">
          {logo}
          {toggle}
          <div className="sidebar-scroll min-h-0 w-full flex-1 overflow-x-hidden overflow-y-auto px-3 py-2">
            <NavGroups role={role} collapsed />
          </div>
          <div className="w-12 shrink-0 border-t border-white/15" />
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger render={<Link href={`${student ? "/student" : ""}/profile`} aria-label={`Profile of ${name}`} className="shrink-0 rounded-full ring-2 ring-white/30 outline-none focus-visible:ring-brand-gold" />}>
                <UserAvatar name={name} image={image} small className="size-10" />
              </TooltipTrigger>
              <TooltipContent side="right">{name}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    aria-label={student ? "Sign out" : "Log out"}
                    onClick={() => signOut({ callbackUrl: student ? "/student/login" : "/login" }).then(() => router.refresh())}
                    className="flex size-10 shrink-0 items-center justify-center rounded-full text-sidebar-foreground/80 outline-none hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-brand-gold"
                  />
                }
              >
                <SignOut className="size-5" />
              </TooltipTrigger>
              <TooltipContent side="right">{student ? "Sign out" : "Log out"}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </aside>
    );
  }

  return (
    <aside className="hidden w-[248px] shrink-0 flex-col overflow-hidden border-r border-black/10 bg-gradient-to-b from-sidebar via-sidebar to-[oklch(0.12_0.05_264)] text-sidebar-foreground md:flex">
      <div className="flex items-center gap-2.5 border-b border-black/10 bg-card px-3.5 py-3.5 text-card-foreground">
        {logo}
        <div className="min-w-0 leading-tight">
          <p className="truncate text-[13px] font-bold tracking-tight">GRANBY COLLEGES</p>
          <p className="truncate text-xs font-medium text-muted-foreground">OF SCIENCE AND TECHNOLOGY</p>
          <p className="truncate text-xs italic text-primary">Education Today, A Brighter Tomorrow</p>
        </div>
      </div>

      <div className="sidebar-scroll min-h-0 flex-1 overflow-y-auto px-3 pt-4 pb-6">
        <NavGroups role={role} />
      </div>

      <button
        type="button"
        onClick={openHelp}
        className="flex items-center justify-center gap-1.5 border-t border-black/10 px-4 py-2.5 text-xs text-sidebar-foreground/70 outline-none hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-brand-gold"
      >
        Press <kbd className="rounded border border-white/25 px-1 font-sans">?</kbd> for keyboard shortcuts
      </button>
      {toggle}
    </aside>
  );
}
