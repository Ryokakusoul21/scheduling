"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ChevronsLeft, ChevronsRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { filterNavForRole } from "./nav-config";
import type { AppRole } from "@/lib/permissions/roles";

export function Sidebar({ role }: { role: AppRole }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const groups = filterNavForRole(role);

  const allHrefs = groups.flatMap((g) => g.items.map((item) => item.href));
  const activeHref = allHrefs
    .filter((href) => pathname === href || pathname.startsWith(href + "/"))
    .sort((a, b) => b.length - a.length)[0];

  return (
    <aside
      className={cn(
        "hidden shrink-0 flex-col overflow-hidden border-r border-black/10 md:flex",
        "bg-gradient-to-b from-sidebar via-sidebar to-[oklch(0.12_0.05_264)] text-sidebar-foreground",
        "transition-[width] duration-200",
        collapsed ? "w-[76px]" : "w-64"
      )}
    >
      <div className="flex items-center gap-2.5 border-b border-black/10 bg-card px-3.5 py-3.5 text-card-foreground">
        <div className="relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white ring-2 ring-gold/50">
          <Image src="/branding/logo.jpg" alt="GCST Seal" fill sizes="40px" className="object-cover" />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate text-[12.5px] font-bold leading-tight tracking-tight">
              GRANBY COLLEGES
            </p>
            <p className="truncate text-[9.5px] font-medium leading-tight text-muted-foreground">
              OF SCIENCE &amp; TECHNOLOGY
            </p>
            <p className="truncate text-[9px] italic leading-tight text-primary/70">
              Education Today, A Brighter Tomorrow
            </p>
          </div>
        )}
      </div>

      <nav className="sidebar-scroll flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {groups.map((group, i) => (
          <div key={i} className={cn(i > 0 && "border-t border-white/[0.06] pt-4")}>
            {group.label && !collapsed && (
              <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-sidebar-foreground/35">
                {group.label}
              </p>
            )}
            <ul className="space-y-1">
              {group.items.map((item) => {
                const active = item.href === activeHref;
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      title={collapsed ? item.label : undefined}
                      className={cn(
                        "group flex items-center gap-3 rounded-lg px-2 py-2 text-[13px] font-medium transition-all duration-150",
                        collapsed && "justify-center px-0",
                        active
                          ? "bg-gold text-gold-foreground"
                          : "text-sidebar-foreground/70 hover:bg-white/[0.06] hover:text-sidebar-foreground"
                      )}
                    >
                      <span
                        className={cn(
                          "flex size-7 shrink-0 items-center justify-center rounded-md transition-colors",
                          active
                            ? "bg-black/10 text-gold-foreground"
                            : "bg-white/[0.05] text-sidebar-foreground/60 group-hover:bg-white/[0.08] group-hover:text-sidebar-foreground"
                        )}
                      >
                        <Icon className="size-4" />
                      </span>
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {!collapsed && (
        <div className="relative h-20 shrink-0 overflow-hidden border-t border-black/10">
          <Image
            src="/branding/school.jpg"
            alt="GCST Campus"
            fill
            sizes="256px"
            loading="eager"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-sidebar via-sidebar/85 to-sidebar/25" />
          <div className="absolute inset-x-0 bottom-0 p-2.5">
            <p className="truncate text-[11px] font-semibold leading-tight">
              Granby Colleges of Science &amp; Technology
            </p>
            <p className="truncate text-[10px] leading-tight text-sidebar-foreground/70">Naic, Cavite</p>
          </div>
        </div>
      )}

      <button
        onClick={() => setCollapsed((c) => !c)}
        className="flex items-center justify-center gap-2 border-t border-black/10 px-4 py-3 text-xs font-medium text-sidebar-foreground/60 transition-colors hover:bg-white/[0.06] hover:text-sidebar-foreground"
      >
        {collapsed ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
        {!collapsed && "Collapse"}
      </button>
    </aside>
  );
}
