"use client";

import Link from "next/link";
import { ArrowUpRight, Check, Info, CheckCircle, Warning, XCircle } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { notificationRelativeTime, notificationTime, type NotificationItem as Item } from "@/lib/notifications/format";
import { cn } from "@/lib/utils";
import { NotificationMessage } from "./notification-message";

const icons = { INFO: Info, SUCCESS: CheckCircle, WARNING: Warning, ERROR: XCircle };
const tints: Record<string, string> = {
  INFO: "text-blue-700 bg-blue-500/10 dark:text-blue-300", SUCCESS: "text-emerald-700 bg-emerald-500/10 dark:text-emerald-300",
  WARNING: "text-amber-700 bg-amber-500/10 dark:text-amber-300", ERROR: "text-destructive bg-destructive/10",
};
const labels: Record<string, string> = { INFO: "Update", SUCCESS: "Success", WARNING: "Attention", ERROR: "Alert" };

export function NotificationItem({ item, pending, onRead, onNavigate, compact = false, now }: {
  item: Item; pending: boolean; onRead: (id: string) => void; onNavigate?: () => void; compact?: boolean; now: Date;
}) {
  const Icon = icons[item.type as keyof typeof icons] ?? Info;
  return (
    <article className={cn("relative flex min-w-0 items-start gap-3 border-b last:border-b-0", compact ? "p-3.5" : "p-4 sm:p-5", !item.isRead && "bg-primary/[0.035] before:absolute before:inset-y-4 before:left-0 before:w-0.5 before:rounded-r-full before:bg-primary")}>
      <span className={cn("flex shrink-0 items-center justify-center rounded-xl", compact ? "size-9" : "size-11", tints[item.type] ?? tints.INFO)} aria-hidden>
        <Icon className={compact ? "size-[18px]" : "size-5"} weight="duotone" />
      </span>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs"><span className="font-medium text-muted-foreground">{labels[item.type] ?? labels.INFO}</span><span aria-hidden className="size-0.5 rounded-full bg-muted-foreground/50" /><time dateTime={item.createdAt} title={notificationTime(item.createdAt)} className="text-muted-foreground">{notificationRelativeTime(item.createdAt, now)}</time>{!item.isRead && <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary"><span className="size-1 rounded-full bg-primary" aria-hidden />New</span>}</div>
        <h4 className={cn("leading-6 break-words", compact ? "text-sm" : "text-base", item.isRead ? "font-medium" : "font-semibold")}>{item.title}{!item.isRead && <span className="sr-only"> (unread)</span>}</h4>
        <NotificationMessage message={item.fullMessage ?? item.message} className={cn("leading-6 text-muted-foreground", compact ? "text-[13px]" : "text-sm")} />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-0.5">
          {item.link && <Link href={item.link} onClick={() => { if (!item.isRead && !pending) onRead(item.id); onNavigate?.(); }} className="inline-flex min-h-8 items-center gap-1 rounded text-xs font-semibold text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring">View details<ArrowUpRight className="size-3.5" aria-hidden /></Link>}
          {item.isRead && !compact && <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Check className="size-3.5" aria-hidden />Read</span>}
        </div>
      </div>
      {!item.isRead && <Button type="button" variant="ghost" size="icon" disabled={pending} onClick={() => onRead(item.id)} aria-label={`Mark “${item.title}” as read`} title="Mark as read" className="size-8 shrink-0 rounded-full text-muted-foreground hover:bg-primary/10 hover:text-primary"><Check className="size-4" aria-hidden /></Button>}
    </article>
  );
}
