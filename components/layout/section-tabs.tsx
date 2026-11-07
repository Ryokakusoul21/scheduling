"use client";

import { usePathname } from "next/navigation";
import { PageTabs } from "@/components/ux/page-tabs";
import type { AppRole } from "@/lib/permissions/roles";
import { onPath, tabsForPath } from "./nav-config";

/** Tab bar for pages that share a sidebar entry (for example Academic Setup); nothing shows for standalone pages. */
export function SectionTabs({ role }: { role: AppRole }) {
  const pathname = usePathname();
  const tabs = tabsForPath(pathname, role);
  if (!tabs) return null;
  return <PageTabs label="Page sections" tabs={tabs.map((t) => ({ href: t.href, label: t.label, icon: t.icon, active: onPath(pathname, t.href) }))} />;
}
