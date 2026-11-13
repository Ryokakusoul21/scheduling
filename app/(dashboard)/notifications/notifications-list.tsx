"use client";

import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Bell, Checks } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import Link from "next/link";
import { CollectionView, RecordsTable } from "@/components/ux/collection-view";
import { NotificationMessage } from "@/components/notifications/notification-message";
import { notificationTime } from "@/lib/notifications/format";
import { NotificationItem } from "@/components/notifications/notification-item";
import { fetchNotifications, useNotificationActions } from "@/components/notifications/use-notifications";
import type { NotificationPage } from "@/lib/notifications/format";

export function NotificationsList({ initialPage, userId }: { initialPage: NotificationPage; userId: string }) {
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const query = useInfiniteQuery({
    queryKey: ["notifications", userId, "list", filter],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => {
      const params = new URLSearchParams({ filter });
      if (pageParam) params.set("cursor", pageParam);
      return fetchNotifications(params, signal);
    },
    getNextPageParam: (page) => page.nextCursor,
    initialData: filter === "all" ? { pages: [initialPage], pageParams: [null] } : undefined,
    refetchInterval: 30_000,
    staleTime: 10_000,
    retry: 1,
  });
  const actions = useNotificationActions(userId);
  const count = query.data?.pages[0]?.unread ?? initialPage.unread;
  const items = [...new Map(query.data?.pages.flatMap((p) => p.items).map((item) => [item.id, item])).values()];
  return (
    <div className="space-y-3" aria-busy={query.isPending}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2" role="group" aria-label="Filter notifications">
          {(["all", "unread"] as const).map((value) => <Button key={value} size="sm" variant={filter === value ? "secondary" : "ghost"} aria-pressed={filter === value} onClick={() => setFilter(value)}>{value === "all" ? "All" : `Unread (${count})`}</Button>)}
        </div>
        <Button size="sm" variant="outline" disabled={!count || actions.isPending} onClick={() => actions.mutate(null)}><Checks className="size-4" /> Mark all as read</Button>
      </div>
      {query.isError && <div role="alert" className="rounded-md border p-3 text-sm">Could not refresh notifications. <Button variant="link" size="sm" disabled={query.isFetching} onClick={() => void query.refetch()}>Retry</Button></div>}
      {query.isPending && <p role="status" className="p-8 text-center text-muted-foreground">Loading notifications…</p>}
      {!query.isPending && !query.isError && !items.length && <Card className="items-center gap-2 p-10 text-center text-muted-foreground"><Bell className="size-8" /><p className="text-sm">{filter === "unread" ? "You’re all caught up." : "No notifications yet."}</p></Card>}
      {!!items.length && <CollectionView storageKey="notifications:view" label="Notifications" table={<RecordsTable label="Notifications" columns={["Notification", "Summary", "Status", "Date", "Actions"]} rows={items.map((item) => ({ id: item.id, cells: [<span key="title" className="font-bold">{item.title}</span>, <NotificationMessage key="message" message={item.fullMessage ?? item.message} />, item.isRead ? "Read" : "Unread", notificationTime(item.createdAt), <div key="actions" className="flex flex-wrap items-center gap-2">{item.link && <Link href={item.link} onClick={() => { if (!item.isRead && !actions.isPending) actions.mutate(item.id); }} className="text-xs font-medium text-primary hover:underline">View details</Link>}{!item.isRead && <Button size="sm" variant="ghost" disabled={actions.isPending} onClick={() => actions.mutate(item.id)}>Mark as read</Button>}</div>] }))} />}><div className="space-y-3">{items.map((item) => <Card key={item.id} className="overflow-hidden p-0"><NotificationItem item={item} pending={actions.isPending} onRead={(id) => actions.mutate(id)} /></Card>)}</div></CollectionView>}
      {query.hasNextPage && <div className="text-center"><Button variant="outline" disabled={query.isFetching} onClick={() => void query.fetchNextPage()}>{query.isFetchingNextPage ? "Loading…" : "Load more"}</Button></div>}
      <p role="status" className="sr-only">{count} unread notifications</p>
    </div>
  );
}
