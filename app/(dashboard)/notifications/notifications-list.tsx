"use client";

import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ArrowClockwise, Bell, Checks, CircleNotch, EnvelopeSimple, WarningCircle } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { NotificationEmpty, NotificationFeed, NotificationSkeleton } from "@/components/notifications/notification-feed";
import { fetchNotifications, useNotificationActions } from "@/components/notifications/use-notifications";
import type { NotificationPage } from "@/lib/notifications/format";
import { useNow } from "@/lib/student/use-now";
import { cn } from "@/lib/utils";

export function NotificationsList({ initialPage, userId, initialNow }: { initialPage: NotificationPage; userId: string; initialNow: string }) {
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const clock = useNow();
  const now = clock ?? new Date(initialNow);
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
    <div className="mx-auto max-w-6xl space-y-6 pb-4" aria-busy={query.isPending}>
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border bg-card p-5 sm:p-6">
        <div className="flex min-w-0 items-center gap-4"><span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/8 text-primary"><Bell className="size-6" weight="duotone" aria-hidden /></span><div><div className="flex flex-wrap items-center gap-2.5"><h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>{count > 0 && <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">{count} unread</span>}</div><p className="mt-1 text-sm leading-6 text-muted-foreground">Your schedule changes, approvals, and account updates.</p></div></div>
        <Button type="button" className="min-h-10" disabled={!count || actions.isPending} onClick={() => actions.mutate(null)}>{actions.isPending ? <CircleNotch className="size-4 animate-spin" aria-hidden /> : <Checks className="size-4" aria-hidden />}Mark all as read</Button>
      </header>
      <div className="grid items-start gap-5 lg:grid-cols-[200px_minmax(0,1fr)]">
        <nav aria-label="Filter notifications" className="flex gap-1 rounded-xl border bg-card p-2 lg:flex-col">
          {(["all", "unread"] as const).map((value) => {
            const Icon = value === "all" ? Bell : EnvelopeSimple;
            return <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)} className={cn("flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-lg px-3 text-left text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring lg:flex-none", filter === value ? "bg-primary/8 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground")}><Icon className="size-[18px] shrink-0" weight={filter === value ? "fill" : "regular"} aria-hidden /><span>{value === "all" ? "All updates" : "Unread"}</span>{value === "unread" && <span className={cn("ml-auto rounded-md px-1.5 py-0.5 text-xs tabular-nums", filter === value ? "bg-primary/10" : "bg-muted")}>{count}</span>}</button>;
          })}
        </nav>
        <div className="min-w-0 space-y-4">
          <div className="flex items-center justify-between gap-3 px-1"><div><h2 className="text-base font-semibold">{filter === "all" ? "Recent updates" : "Unread updates"}</h2><p className="mt-0.5 text-xs text-muted-foreground">Newest first</p></div><Button type="button" variant="ghost" size="icon" aria-label="Refresh notifications" title="Refresh notifications" disabled={query.isFetching} onClick={() => void query.refetch()}><ArrowClockwise className={cn("size-[18px]", query.isFetching && "animate-spin")} aria-hidden /></Button></div>
          {query.isError && <div role="alert" className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm"><WarningCircle className="mt-0.5 size-5 shrink-0 text-amber-700" aria-hidden /><div className="flex-1"><p className="font-medium">Couldn’t refresh notifications</p><p className="mt-1 text-muted-foreground">{items.length ? "Your last loaded updates are shown below." : "Please try again to load your updates."}</p></div><Button variant="outline" size="sm" disabled={query.isFetching} onClick={() => void query.refetch()}>Retry</Button></div>}
          {query.isPending && <NotificationSkeleton />}
          {!query.isPending && !query.isError && !items.length && <NotificationEmpty unreadOnly={filter === "unread"} />}
          {!!items.length && <NotificationFeed items={items} now={now} pending={actions.isPending} onRead={(id) => actions.mutate(id)} />}
          {query.hasNextPage && <div className="flex justify-center pt-2"><Button type="button" variant="outline" className="min-h-10" disabled={query.isFetching} onClick={() => void query.fetchNextPage()}>{query.isFetchingNextPage && <CircleNotch className="size-4 animate-spin" aria-hidden />}{query.isFetchingNextPage ? "Loading updates…" : "Load older notifications"}</Button></div>}
        </div>
      </div>
      <p role="status" className="sr-only">{count} unread notifications</p>
    </div>
  );
}
