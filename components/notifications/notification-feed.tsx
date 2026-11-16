import { Bell, Checks } from "@phosphor-icons/react/ssr";
import { Skeleton } from "@/components/ui/skeleton";
import { groupNotifications, type NotificationItem as Item } from "@/lib/notifications/format";
import { cn } from "@/lib/utils";
import { NotificationItem } from "./notification-item";

export function NotificationFeed({ items, now, compact = false, pending, onRead, onNavigate }: {
  items: Item[]; now: Date; compact?: boolean; pending: boolean; onRead: (id: string) => void; onNavigate?: () => void;
}) {
  return <div className={compact ? "" : "space-y-6"}>
    {groupNotifications(items, now).map((group) => <section key={group.label} aria-label={group.label}>
      <header className={cn("flex items-center gap-2", compact ? "bg-muted/40 px-4 py-2" : "mb-2.5 px-1")}><h3 className="text-xs font-semibold text-muted-foreground">{group.label}</h3><span className="text-xs tabular-nums text-muted-foreground/70">{group.items.length}</span></header>
      <div className={cn(!compact && "overflow-hidden rounded-xl border bg-card")}>
        {group.items.map((item) => <NotificationItem key={item.id} item={item} now={now} compact={compact} pending={pending} onRead={onRead} onNavigate={onNavigate} />)}
      </div>
    </section>)}
  </div>;
}

export function NotificationEmpty({ unreadOnly, compact = false }: { unreadOnly: boolean; compact?: boolean }) {
  const Icon = unreadOnly ? Checks : Bell;
  return <div className={cn("flex flex-col items-center justify-center text-center", compact ? "px-6 py-12" : "rounded-2xl border border-dashed bg-card px-6 py-20")}>
    <span className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary/5 text-primary"><Icon className="size-7" weight="duotone" aria-hidden /></span>
    <h3 className="text-base font-semibold">{unreadOnly ? "You’re all caught up" : "No notifications yet"}</h3>
    <p className="mt-2 max-w-xs text-sm leading-6 text-muted-foreground">{unreadOnly ? "You’ve read all your updates. New notifications will appear here." : "Schedule changes and account updates will appear here when there’s something new."}</p>
  </div>;
}

export function NotificationSkeleton({ compact = false }: { compact?: boolean }) {
  return <div role="status" aria-label="Loading notifications" className={cn("space-y-5", compact ? "p-4" : "rounded-xl border bg-card p-5")}>
    {[0, 1, 2].map((row) => <div key={row} className="flex gap-3"><Skeleton className="size-10 shrink-0 rounded-xl" /><div className="flex-1 space-y-2"><Skeleton className="h-3 w-24" /><Skeleton className="h-4 w-4/5" /><Skeleton className="h-3 w-full" /></div></div>)}
  </div>;
}
