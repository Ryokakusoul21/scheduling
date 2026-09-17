"use client";

import { useTransition } from "react";
import Link from "next/link";
import { Bell, CheckCheck, Info, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { markNotificationReadAction, markAllNotificationsReadAction } from "./actions";

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  link: string;
  createdAt: string;
}

const ICONS: Record<string, typeof Info> = {
  INFO: Info,
  SUCCESS: CheckCircle2,
  WARNING: AlertTriangle,
  ERROR: XCircle,
};

const TINTS: Record<string, string> = {
  INFO: "text-blue-600 bg-blue-500/10",
  SUCCESS: "text-emerald-600 bg-emerald-500/10",
  WARNING: "text-amber-600 bg-amber-500/10",
  ERROR: "text-destructive bg-destructive/10",
};

export function NotificationsList({ notifications }: { notifications: Notification[] }) {
  const [pending, startTransition] = useTransition();
  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <div className="space-y-3">
      {unreadCount > 0 && (
        <div className="flex justify-end">
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => startTransition(async () => { await markAllNotificationsReadAction(); })}
          >
            <CheckCheck className="size-4" /> Mark all as read
          </Button>
        </div>
      )}

      {notifications.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-10 text-center text-muted-foreground">
            <Bell className="size-8" />
            <p className="text-sm">You have no notifications yet.</p>
          </CardContent>
        </Card>
      )}

      {notifications.map((n) => {
        const Icon = ICONS[n.type] ?? Info;
        const content = (
          <div className={`flex items-start gap-3 p-4 ${!n.isRead ? "bg-accent/40" : ""}`}>
            <div className={`flex size-9 shrink-0 items-center justify-center rounded-full ${TINTS[n.type] ?? TINTS.INFO}`}>
              <Icon className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{n.title}</p>
              <p className="text-sm text-muted-foreground">{n.message}</p>
              <p className="mt-1 text-xs text-muted-foreground">{n.createdAt}</p>
            </div>
            {!n.isRead && (
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={(e) => {
                  e.preventDefault();
                  startTransition(async () => { await markNotificationReadAction(n.id); });
                }}
              >
                Mark read
              </Button>
            )}
          </div>
        );
        return (
          <Card key={n.id} className="overflow-hidden p-0">
            {n.link ? <Link href={n.link}>{content}</Link> : content}
          </Card>
        );
      })}
    </div>
  );
}
