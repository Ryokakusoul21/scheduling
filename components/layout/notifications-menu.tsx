"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Bell, Checks, X } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { Popover, PopoverClose, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { NotificationItem } from "@/components/notifications/notification-item";
import { fetchNotifications, useNotificationActions } from "@/components/notifications/use-notifications";

export function NotificationsMenu({ unread, allHref, userId }: { unread: number; allHref: string; userId: string }) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | "unread">("all");
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
      <PopoverTrigger render={<Button variant="ghost" size="icon" className="relative size-10" aria-label={label} title="Notifications" />}>
        <Bell className="size-5" />
        {count > 0 && <span aria-hidden className="absolute -top-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-danger px-1 text-[11px] font-semibold text-white ring-2 ring-card">{count > 99 ? "99+" : count}</span>}
      </PopoverTrigger>
      <span role="status" className="sr-only">{label}</span>
      <PopoverContent side="bottom" align="end" sideOffset={10} className="grid max-h-[min(36rem,var(--available-height))] w-[min(25rem,calc(100vw-1.5rem))] grid-rows-[auto_auto_minmax(0,1fr)_auto] gap-0 overflow-hidden rounded-xl p-0 shadow-xl">
        <PopoverHeader className="relative border-b px-4 py-3 pr-12">
          <PopoverTitle className="text-base font-bold">Notifications</PopoverTitle>
          <PopoverDescription className="text-xs">Schedule updates and account alerts.</PopoverDescription>
          <PopoverClose render={<Button variant="ghost" size="icon-sm" className="absolute top-2.5 right-2.5" aria-label="Close notifications" />}><X className="size-4" /></PopoverClose>
        </PopoverHeader>
        <div className="flex gap-2 px-3 py-2" role="group" aria-label="Filter notifications">
          {(["all", "unread"] as const).map((value) => <Button key={value} size="sm" variant={filter === value ? "secondary" : "ghost"} aria-pressed={filter === value} onClick={() => setFilter(value)}>{value === "all" ? "All" : `Unread (${count})`}</Button>)}
        </div>
        <div className="min-h-0 space-y-1 overflow-y-auto overscroll-contain px-2 pb-2" aria-busy={query.isPending}>
          {query.isError && <div role="alert" className="rounded-md border p-3 text-sm">Could not refresh notifications. <Button variant="link" size="sm" disabled={query.isFetching} onClick={() => void query.refetch()}>Retry</Button></div>}
          {query.isPending && <p role="status" className="py-8 text-center text-sm text-muted-foreground">Loading notifications…</p>}
          {!query.isError && query.data?.items.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">{filter === "unread" ? "You’re all caught up." : "No notifications yet."}</p>}
          {query.data?.items.map((item) => <NotificationItem key={item.id} item={item} pending={actions.isPending} onRead={(id) => actions.mutate(id)} onNavigate={() => setOpen(false)} />)}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-popover p-3">
          <Button variant="outline" size="sm" disabled={!count || actions.isPending} onClick={() => actions.mutate(null)}><Checks className="size-4" /> Mark all as read</Button>
          <Button size="sm" nativeButton={false} render={<Link href={allHref} onClick={() => setOpen(false)} />}>View all</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
