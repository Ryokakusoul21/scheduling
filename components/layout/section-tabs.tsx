"use client";

import { usePathname, useRouter } from "next/navigation";
import { PageTabs } from "@/components/ux/page-tabs";
import { NativeSelect } from "@/components/ux/native-select";
import type { AppRole } from "@/lib/permissions/roles";
import { onPath, tabsForPath } from "./nav-config";

/** Tab bar for pages that share a sidebar entry (for example Academic Setup); nothing shows for standalone pages. */
export function SectionTabs({ role }: { role: AppRole }) {
  const pathname = usePathname();
  const router = useRouter();
  const tabs = tabsForPath(pathname, role);
  if (!tabs) return null;
  if (role === "REGISTRAR" && tabs[0].tabGroup === "setup") {
    const active = tabs.find((t) => onPath(pathname, t.href)) ?? tabs[0];
    return <section aria-label="Academic Setup workspace" className="space-y-2 print:hidden">
      <div><p className="font-semibold">Academic Setup</p><p className="text-xs text-muted-foreground">Manage the school calendar, curriculum and resources.</p></div>
      <NativeSelect aria-label="Academic Setup section" value={active.href} className="md:hidden" options={tabs.map((t) => ({ value: t.href, label: t.label }))}
        onChange={(e) => { if (tabs.some((t) => t.href === e.target.value)) router.push(e.target.value); }} />
      <div className="hidden md:block"><PageTabs label="Academic Setup sections" className="w-full flex-wrap [&>a]:px-3" tabs={tabs.map((t) => ({ href: t.href, label: t.label, icon: t.icon, active: onPath(pathname, t.href) }))} /></div>
    </section>;
  }
  return <PageTabs label="Page sections" tabs={tabs.map((t) => ({ href: t.href, label: t.label, icon: t.icon, active: onPath(pathname, t.href) }))} />;
}
