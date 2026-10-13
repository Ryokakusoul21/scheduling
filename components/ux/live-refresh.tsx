"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * Keeps a server-rendered page live: polls the data fingerprint while the tab is visible and
 * refreshes the page as soon as schedules, bookings, adjustments, or workload fixes change.
 */
export function LiveRefresh({ intervalMs = 5000, className }: { intervalMs?: number; className?: string }) {
  const router = useRouter();
  const last = useRef<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    let stopped = false;
    async function poll() {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/data-version", { cache: "no-store" });
        if (!res.ok) throw new Error();
        const { version } = (await res.json()) as { version: string };
        if (stopped) return;
        setOffline(false);
        if (last.current !== null && last.current !== version) {
          router.refresh();
          setUpdatedAt(new Date().toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit", second: "2-digit" }));
        }
        last.current = version;
      } catch {
        if (!stopped) setOffline(true);
      }
    }
    void poll();
    const timer = setInterval(poll, intervalMs);
    document.addEventListener("visibilitychange", poll);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [intervalMs, router]);

  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs text-muted-foreground print:hidden", className)} aria-live="polite">
      <span className={cn("size-2 rounded-full", offline ? "bg-amber-500" : "animate-pulse bg-emerald-500")} aria-hidden />
      {offline ? "Live updates paused" : updatedAt ? `Live · updated ${updatedAt}` : "Live"}
    </span>
  );
}
