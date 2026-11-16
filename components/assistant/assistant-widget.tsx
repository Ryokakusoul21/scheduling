"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Sparkle as Sparkles, X } from "@phosphor-icons/react/ssr";
import { Popover, PopoverClose, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { AssistantChat } from "@/components/assistant/assistant-chat";
import { getAssistantHistory } from "@/app/(dashboard)/assistant/actions";
import { Button } from "@/components/ui/button";
import type { AppRole } from "@/lib/permissions/roles";
import { assistantPage } from "@/lib/ai/assistant-contract";

/** Floating button that opens the Scheduling Assistant chat in a popup from any page. */
export function AssistantWidget({ userName, userId, role }: { userName?: string | null; userId: string; role: AppRole }) {
  const [open, setOpen] = useState(false);
  const page = assistantPage(usePathname(), role);
  const history = useQuery({
    queryKey: ["assistant-history", userId], queryFn: () => getAssistantHistory(),
    enabled: open, staleTime: 0, retry: 1, refetchOnWindowFocus: false, refetchOnReconnect: false,
  });

  function onOpenChange(next: boolean) {
    setOpen(next);
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange} modal={false}>
      <PopoverTrigger
        type="button"
        aria-label="Open Scheduling Assistant"
        className="fixed right-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-40 flex size-12 items-center justify-center rounded-full bg-gradient-to-br from-primary to-violet-500 text-primary-foreground shadow-lg outline-none transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-brand-gold md:right-6 md:bottom-6 md:size-14 print:hidden"
      >
        <Sparkles className="size-6" weight="fill" />
      </PopoverTrigger>

      <PopoverContent side="top" align="end" sideOffset={12} className="grid h-[min(35rem,var(--available-height))] w-[min(25rem,calc(100vw-1.5rem))] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden rounded-xl p-0 shadow-xl">
        <PopoverHeader className="relative border-b px-4 py-3 pr-12">
          <PopoverTitle className="text-base font-bold">Scheduling Assistant</PopoverTitle>
          <PopoverDescription className="text-xs">Answers from your scheduling data</PopoverDescription>
          <PopoverClose render={<Button variant="ghost" size="icon-sm" className="absolute top-2.5 right-2.5" aria-label="Close Scheduling Assistant" />}><X className="size-4" /></PopoverClose>
        </PopoverHeader>
        {history.isError ? (
          <div role="alert" className="space-y-3 p-6 text-center text-sm">
            <p>Could not load your conversation.</p>
            <Button variant="outline" disabled={history.isFetching} onClick={() => void history.refetch()}>Retry</Button>
          </div>
        ) : history.isPending || history.isFetching ? (
          <p role="status" className="p-6 text-center text-muted-foreground">Loading conversation…</p>
        ) : (
          <AssistantChat initialMessages={history.data} userName={userName} staff role={role} currentPage={page} className="h-full" />
        )}
      </PopoverContent>
    </Popover>
  );
}
