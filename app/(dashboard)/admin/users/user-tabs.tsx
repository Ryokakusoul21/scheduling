import Link from "next/link";
import { cn } from "@/lib/utils";

/** Switches between active accounts and the Archived list in User Management. */
export function UserTabs({ current, archivedCount }: { current: "active" | "archived"; archivedCount: number }) {
  const tabs = [
    { key: "active", label: "Active", href: "/admin/users" },
    { key: "archived", label: `Archived (${archivedCount})`, href: "/admin/users/archived" },
  ];
  return (
    <nav aria-label="User Management sections" className="flex gap-1 border-b">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={current === t.key ? "page" : undefined}
          className={cn(
            "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
            current === t.key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
