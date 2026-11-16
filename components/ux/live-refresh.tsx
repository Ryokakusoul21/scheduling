"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * Silently polls the data fingerprint while the tab is visible and
 * refreshes the page as soon as schedules, bookings, adjustments, or workload fixes change.
 */
export function LiveRefresh({ intervalMs = 5000 }: { intervalMs?: number }) {
  const router = useRouter();
  const last = useRef<string | null>(null);

  useEffect(() => {
    let stopped = false;
    async function poll() {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/data-version", { cache: "no-store" });
        if (!res.ok) throw new Error();
        const { version } = (await res.json()) as { version: string };
        if (stopped) return;
        if (last.current !== null && last.current !== version) {
          router.refresh();
        }
        last.current = version;
      } catch {
        // Retry on the next poll if the connection is unavailable.
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

  return null;
}
