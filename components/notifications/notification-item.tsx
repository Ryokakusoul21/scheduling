"use client";

import Link from "next/link";
import { Info, CheckCircle, Warning, XCircle } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { notificationTime, type NotificationItem as Item } from "@/lib/notifications/format";
import { NotificationMessage } from "./notification-message";

const icons = { INFO: Info, SUCCESS: CheckCircle, WARNING: Warning, ERROR: XCircle };
const tints: Record<string, string> = {
  INFO: "text-blue-600 bg-blue-500/10", SUCCESS: "text-emerald-600 bg-emerald-500/10",
  WARNING: "text-amber-600 bg-amber-500/10", ERROR: "text-destructive bg-destructive/10",
};

export function NotificationItem({ item, pending, onRead, onNavigate }: {
  item: Item; pending: boolean; onRead: (id: string) => void; onNavigate?: () => void;
}) {
  const Icon = icons[item.type as keyof typeof icons] ?? Info;
  return (
    <article className={`flex items-start gap-3 rounded-md p-3 ${item.isRead ? "" : "bg-accent/40"}`}>
      <span className={`flex size-8 shrink-0 items-center justify-center rounded-full ${tints[item.type] ?? tints.INFO}`} aria-hidden>
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm font-bold leading-snug">{item.title}{!item.isRead && <span className="sr-only"> (unread)</span>}</p>
        <NotificationMessage message={item.fullMessage ?? item.message} />
        <time dateTime={item.createdAt} className="block text-xs text-muted-foreground">{notificationTime(item.createdAt)}</time>
        <div className="flex flex-wrap items-center gap-3 pt-1">
          {item.link && <Link href={item.link} onClick={() => { if (!item.isRead && !pending) onRead(item.id); onNavigate?.(); }} className="text-xs font-medium text-primary hover:underline">View details</Link>}
          {!item.isRead && <Button variant="ghost" size="sm" disabled={pending} onClick={() => onRead(item.id)} className="h-7 px-2 text-xs">Mark as read</Button>}
        </div>
      </div>
    </article>
  );
}
