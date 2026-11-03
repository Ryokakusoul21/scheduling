"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { CaretRight, DotsThree, House } from "@phosphor-icons/react/ssr";
import type { AppRole } from "@/lib/permissions/roles";
import { buildBreadcrumbs, type BreadcrumbItem } from "@/lib/navigation/breadcrumbs";
import { cn } from "@/lib/utils";

const LEAVE_MESSAGE = "You have unsaved changes. Leave this page anyway?";

/** Announces dirty state to global navigation such as breadcrumbs. */
export function setBreadcrumbDirty(dirty: boolean) {
  window.dispatchEvent(new CustomEvent("granby:dirty-state", { detail: dirty }));
}

/** Accessible breadcrumb presentation shared by page routes and in-page selection flows. */
export function Breadcrumbs({ items, className }: { items: BreadcrumbItem[]; className?: string }) {
  const [expanded, setExpanded] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const markDirty = (event: Event) => {
      const target = event.target instanceof Element ? event.target : null;
      const form = target?.closest("form");
      if (!form || form.dataset.breadcrumbIgnoreDirty === "true" || form.closest('[role="search"]')) return;
      setDirty(true);
    };
    const clearDirty = () => setDirty(false);
    const receiveDirty = (event: Event) => setDirty(Boolean((event as CustomEvent<boolean>).detail));
    document.addEventListener("input", markDirty, true);
    document.addEventListener("change", markDirty, true);
    document.addEventListener("submit", clearDirty, true);
    document.addEventListener("reset", clearDirty, true);
    window.addEventListener("granby:dirty-state", receiveDirty);
    return () => {
      document.removeEventListener("input", markDirty, true);
      document.removeEventListener("change", markDirty, true);
      document.removeEventListener("submit", clearDirty, true);
      document.removeEventListener("reset", clearDirty, true);
      window.removeEventListener("granby:dirty-state", receiveDirty);
    };
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function leave(event: MouseEvent<HTMLAnchorElement>) {
    if (dirty && !window.confirm(LEAVE_MESSAGE)) event.preventDefault();
    else setDirty(false);
  }

  const renderItem = (item: BreadcrumbItem, index: number, compact = false) => {
    const current = index === items.length - 1;
    const content = <span className={cn("inline-flex min-w-0 items-center gap-1.5", compact && "max-w-36 sm:max-w-52")}>
      {item.home && <House className="size-3.5 shrink-0" weight="fill" aria-hidden />}
      <span className="truncate" title={item.label}>{item.label}</span>
    </span>;
    return <li key={`${item.label}-${index}`} className="flex min-w-0 items-center gap-1.5">
      {index > 0 && <CaretRight className="size-3.5 shrink-0 text-muted-foreground/70" aria-hidden />}
      {item.href && !current
        ? <Link href={item.href} onClick={leave} className="rounded-sm font-medium text-muted-foreground outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">{content}</Link>
        : <span aria-current={current ? "page" : undefined} className="min-w-0 font-semibold text-foreground">{content}</span>}
    </li>;
  };

  const collapsed = items.length > 3 && !expanded;
  return <nav aria-label="Breadcrumb" className={cn("print:hidden", className)}>
    <ol className="hidden min-w-0 flex-wrap items-center gap-1.5 text-sm md:flex">{items.map((item, index) => renderItem(item, index, true))}</ol>
    <ol className="flex min-w-0 items-center gap-1.5 text-xs md:hidden">
      {!collapsed && items.map((item, index) => renderItem(item, index, true))}
      {collapsed && <>
        {renderItem(items[0], 0, true)}
        <li className="flex items-center gap-1.5">
          <CaretRight className="size-3.5 text-muted-foreground/70" aria-hidden />
          <button type="button" onClick={() => setExpanded(true)} aria-label="Show full breadcrumb path" aria-expanded="false" className="rounded-sm p-1 text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"><DotsThree className="size-4" weight="bold" aria-hidden /></button>
        </li>
        {items.slice(-2).map((item, offset) => renderItem(item, items.length - 2 + offset, true))}
      </>}
    </ol>
  </nav>;
}

/** URL-driven page breadcrumb. Layouts render it once so every current and future page inherits it. */
export function AppBreadcrumbs({ role, departmentName }: { role: AppRole; departmentName?: string | null }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const items = useMemo(() => buildBreadcrumbs(pathname, new URLSearchParams(query), role, departmentName), [pathname, query, role, departmentName]);
  if (pathname === "/scheduler") return null;
  return <Breadcrumbs key={`${pathname}?${query}`} items={items} />;
}
