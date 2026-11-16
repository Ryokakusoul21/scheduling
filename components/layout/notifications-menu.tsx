"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Bell, Checks, WarningCircle, X } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { Popover, PopoverClose, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { NotificationEmpty, NotificationFeed, NotificationSkeleton } from "@/components/notifications/notification-feed";
import { fetchNotifications, useNotificationActions } from "@/components/notifications/use-notifications";
import { useNow } from "@/lib/student/use-now";
import { cn } from "@/lib/utils";

export function NotificationsMenu({ unread, allHref, userId }: { unread: number; allHref: string; userId: string }) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const now = useNow();
  const query = useQuery({
    queryKey: ["notifications", userId, "recent", filter],
    queryFn: ({ signal }) => fetchNotifications(new URLSearchParams({ recent: "1", filter }), signal),
    refetchInterval: 30_000,
    staleTime: 10_000,
    retry: 1,
  });
  const actions = useNotificationActions(userId);
  const count = query.data?.unread ?? unread;
  const label = count > 0 ? `Notifications, ${count} unread` : "Notifications";

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) void query.refetch();
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange} modal={false}>
      <PopoverTrigger render={<Button variant="ghost" size="icon" className="relative size-10 rounded-xl aria-expanded:bg-primary/8 aria-expanded:text-primary" aria-label={label} title="Notifications" />}>
        <Bell className="size-5" weight={count ? "duotone" : "regular"} aria-hidden />
        {count > 0 && <span aria-hidden className="absolute -top-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-danger px-1 text-[11px] font-semibold text-white ring-2 ring-card">{count > 99 ? "99+" : count}</span>}
      </PopoverTrigger>
      <span role="status" className="sr-only">{label}</span>
      <PopoverContent side="bottom" align="end" sideOffset={12} className="grid max-h-[min(40rem,var(--available-height))] w-[min(27rem,calc(100vw-1.5rem))] grid-rows-[auto_auto_minmax(0,1fr)_auto] gap-0 overflow-hidden rounded-2xl p-0 shadow-xl">
        <PopoverHeader className="relative border-b p-5 pr-14">
          <div className="mb-1 flex items-center gap-2.5"><PopoverTitle className="text-lg font-semibold tracking-tight">Notifications</PopoverTitle>{count > 0 && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">{count} new</span>}</div>
          <PopoverDescription className="text-sm">Your latest school updates, in one place.</PopoverDescription>
          <PopoverClose render={<Button variant="ghost" size="icon" className="absolute top-4 right-3 rounded-full text-muted-foreground" aria-label="Close notifications" />}><X className="size-4" aria-hidden /></PopoverClose>
        </PopoverHeader>
        <div className="border-b px-4 py-3"><div className="inline-flex gap-1 rounded-lg bg-muted/65 p-1" role="group" aria-label="Filter notifications">
          {(["all", "unread"] as const).map((value) => <button key={value} type="button" className={cn("min-h-8 rounded-md px-3 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring", filter === value ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground")} aria-pressed={filter === value} onClick={() => setFilter(value)}>{value === "all" ? "All updates" : `Unread (${count})`}</button>)}
        </div>
        </div>
        <div className="min-h-0 overflow-y-auto overscroll-contain" aria-busy={query.isPending}>
          {query.isError && <div role="alert" className="m-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm"><WarningCircle className="mt-0.5 size-4 shrink-0 text-amber-700" aria-hidden /><div>Couldn’t refresh notifications.<Button variant="link" size="sm" disabled={query.isFetching} onClick={() => void query.refetch()}>Retry</Button></div></div>}
          {query.isPending && <NotificationSkeleton compact />}
          {!query.isError && query.data?.items.length === 0 && <NotificationEmpty unreadOnly={filter === "unread"} compact />}
          {query.data && <NotificationFeed items={query.data.items} now={now ?? new Date(0)} compact pending={actions.isPending} onRead={(id) => actions.mutate(id)} onNavigate={() => setOpen(false)} />}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-muted/20 p-3">
          <Button type="button" variant="ghost" size="sm" className="min-h-9 text-xs" disabled={!count || actions.isPending} onClick={() => actions.mutate(null)}><Checks className="size-4" aria-hidden />Mark all as read</Button>
          <Link href={allHref} onClick={() => setOpen(false)} className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-2 text-xs font-semibold text-primary outline-none hover:bg-primary/5 focus-visible:ring-2 focus-visible:ring-ring">View all notifications<ArrowRight className="size-3.5" aria-hidden /></Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
