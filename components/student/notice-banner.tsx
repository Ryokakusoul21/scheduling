"use client";

import { useSyncExternalStore } from "react";
import { Megaphone, X } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { ActivityTypeBadge } from "./activity-badge";
import { AFFECTS_CLASSES, formatDateRange, manilaNow } from "@/lib/student/format";
import { shiftDate } from "@/lib/student/schedule";
import type { PortalActivity } from "@/lib/student/portal";

const KEY = "student-dismissed-notices";
const EVENT = "student-notices-change";

function read() {
  try {
    return localStorage.getItem(KEY) ?? "[]";
  } catch {
    return "[]";
  }
}
function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** Dismissible notices for holidays, suspensions, and examination weeks happening now or within two weeks. */
export function NoticeBanner({ activities }: { activities: PortalActivity[] }) {
  const raw = useSyncExternalStore(subscribe, read, () => null);
  if (raw === null) return null;
  const dismissed: string[] = JSON.parse(raw);
  const today = manilaNow().date;
  const horizon = shiftDate(today, 14).date;
  const notices = activities.filter((a) => AFFECTS_CLASSES.has(a.type) && a.endDate >= today && a.startDate <= horizon && !dismissed.includes(a.id));
  if (notices.length === 0) return null;

  function dismiss(id: string) {
    try {
      localStorage.setItem(KEY, JSON.stringify([...dismissed, id].slice(-50)));
    } catch {}
    window.dispatchEvent(new Event(EVENT));
  }

  return (
    <section aria-label="Important notices" className="space-y-2 print:hidden">
      {notices.map((a) => (
        <div key={a.id} role="status" className="flex items-start gap-3 rounded-xl border border-amber-600/30 bg-amber-50 p-3 text-amber-950 dark:bg-amber-950/40 dark:text-amber-100">
          <Megaphone className="mt-0.5 size-5 shrink-0" aria-hidden />
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold">{a.title}</p>
              <ActivityTypeBadge type={a.type} />
            </div>
            <p className="text-sm">
              {a.startDate <= today ? `Ongoing until ${formatDateRange(a.endDate, a.endDate)}` : formatDateRange(a.startDate, a.endDate)}
              {a.description && ` · ${a.description}`}
            </p>
          </div>
          <Button variant="ghost" size="icon" className="size-11 shrink-0 sm:size-9" aria-label={`Dismiss notice: ${a.title}`} onClick={() => dismiss(a.id)}>
            <X className="size-4" />
          </Button>
        </div>
      ))}
    </section>
  );
}
