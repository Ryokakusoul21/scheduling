"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { CaretDoubleLeft as ChevronsLeft, CaretDoubleRight as ChevronsRight, CaretDown } from "@phosphor-icons/react/ssr";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { filterNavForRole } from "./nav-config";
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

/** Longest nav href matching the current path, so nested pages light up their parent. */
function useActiveHref(role: AppRole) {
  const pathname = usePathname();
  return filterNavForRole(role)
    .flatMap((g) => g.items.map((item) => item.href))
    .filter((href) => pathname === href || pathname.startsWith(href + "/"))
    .sort((a, b) => b.length - a.length)[0];
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
            <div key={group.label} className={cn(i > 0 && "border-t border-white/[0.06] pt-3")}>
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
                          collapsed && "justify-center px-0",
                          active
                            ? "bg-white/[0.12] text-white before:absolute before:inset-y-1.5 before:left-0 before:w-1 before:rounded-r-full before:bg-brand-gold"
                            : "text-sidebar-foreground/75 hover:bg-white/[0.06] hover:text-sidebar-foreground"
                        )}
                      >
                        <item.icon className={cn("size-[18px] shrink-0", active && "text-brand-gold")} weight={active ? "fill" : "regular"} />
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

export function Sidebar({ role }: { role: AppRole }) {
  const [collapsed, setCollapsed] = useState(false);
  const { openHelp } = useShortcuts();

  return (
    <aside
      className={cn(
        "hidden shrink-0 flex-col overflow-hidden border-r border-black/10 md:flex",
        "bg-gradient-to-b from-sidebar via-sidebar to-[oklch(0.12_0.05_264)] text-sidebar-foreground",
        "transition-[width] duration-200",
        collapsed ? "w-[76px]" : "w-[248px]"
      )}
    >
      <div className="flex items-center gap-2.5 border-b border-black/10 bg-card px-3.5 py-3.5 text-card-foreground">
        <div className="relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white ring-2 ring-brand-gold/60">
          <Image src="/branding/logo.jpg" alt="GRANBY COLLEGES OF SCIENCE & TECHNOLOGY Seal" fill sizes="40px" className="object-cover" />
        </div>
        {!collapsed && (
          <div className="min-w-0 leading-tight">
            <p className="truncate text-[13px] font-bold tracking-tight">GRANBY COLLEGES</p>
            <p className="truncate text-xs font-medium text-muted-foreground">OF SCIENCE &amp; TECHNOLOGY</p>
            <p className="truncate text-xs italic text-primary">Education Today, A Brighter Tomorrow</p>
          </div>
        )}
      </div>

      <div className="sidebar-scroll min-h-0 flex-1 overflow-y-auto px-3 pt-4 pb-6">
        <NavGroups role={role} collapsed={collapsed} />
      </div>

      {!collapsed && (
        <button
          type="button"
          onClick={openHelp}
          className="flex items-center justify-center gap-1.5 border-t border-black/10 px-4 py-2.5 text-xs text-sidebar-foreground/70 outline-none hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-brand-gold"
        >
          Press <kbd className="rounded border border-white/25 px-1 font-sans">?</kbd> for keyboard shortcuts
        </button>
      )}

      <button
        type="button"
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        aria-expanded={!collapsed}
        onClick={() => setCollapsed((c) => !c)}
        className="flex items-center justify-center gap-2 border-t border-black/10 px-4 py-3 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-white/[0.06] hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-brand-gold focus-visible:outline-none"
      >
        {collapsed ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
        {!collapsed && "Collapse"}
      </button>
    </aside>
  );
}
