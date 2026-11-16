"use client";

import { usePathname, useRouter } from "next/navigation";
import { PageTabs } from "@/components/ux/page-tabs";
import { NativeSelect } from "@/components/ux/native-select";
import type { AppRole } from "@/lib/permissions/roles";
import { navMatchesPath, tabsForPath } from "./nav-config";

/** Tab bar for pages that share a sidebar entry; legacy calendar routes select the merged Programs & Terms tab. */
export function SectionTabs({ role }: { role: AppRole }) {
  const pathname = usePathname();
  const router = useRouter();
  const tabs = tabsForPath(pathname, role);
  if (!tabs) return null;
  if (role === "REGISTRAR" && tabs[0].tabGroup === "setup") {
    const active = tabs.find((t) => navMatchesPath(pathname, t)) ?? tabs[0];
    return <section aria-label="Academic Record workspace" className="space-y-2 print:hidden">
      <div><p className="font-semibold">Academic Record</p><p className="text-xs text-muted-foreground">Manage programs, academic years, terms, and school resources.</p></div>
      <NativeSelect aria-label="Academic Record section" value={active.href} className="md:hidden [&_select]:h-11 [&_select]:bg-card [&_select]:text-base" options={tabs.map((t) => ({ value: t.href, label: t.label }))}
        onChange={(e) => { if (tabs.some((t) => t.href === e.target.value)) router.push(e.target.value); }} />
      <div className="hidden md:block"><PageTabs label="Academic Record sections" className="w-full flex-wrap [&>a]:px-3" tabs={tabs.map((t) => ({ href: t.href, label: t.label, icon: t.icon, active: navMatchesPath(pathname, t) }))} /></div>
    </section>;
  }
  return <PageTabs label="Page sections" tabs={tabs.map((t) => ({ href: t.href, label: t.label, icon: t.icon, active: navMatchesPath(pathname, t) }))} />;
}
