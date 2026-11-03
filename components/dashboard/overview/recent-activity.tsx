"use client";

import { useState } from "react";
import { ClockCounterClockwise } from "@phosphor-icons/react/ssr";
import { Switch } from "@/components/ui/switch";
import type { ActivityEntry } from "./data";
import { QuietState } from "./kit";

/** Latest changes grouped by day; sign-in and sign-out events are hidden unless asked for. */
export function RecentActivity({ entries, limit = 8 }: { entries: ActivityEntry[]; limit?: number }) {
  const [showSignIns, setShowSignIns] = useState(false);
  const shown = entries.filter((e) => showSignIns || !e.auth).slice(0, limit);
  const days = [...new Set(shown.map((e) => e.day))];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold">Recent activity</h3>
        <label className="flex cursor-pointer items-center gap-2 text-[13px] text-muted-foreground">
          <Switch checked={showSignIns} onCheckedChange={setShowSignIns} />
          Show sign-ins
        </label>
      </div>
      {shown.length === 0 ? (
        <QuietState icon={ClockCounterClockwise} title="No recent changes" />
      ) : (
        days.map((day) => (
          <div key={day} className="space-y-1.5">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{day}</p>
            <ul className="space-y-2">
              {shown
                .filter((e) => e.day === day)
                .map((e) => (
                  <li key={e.id} className="flex gap-2.5">
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-info" aria-hidden />
                    <span className="min-w-0">
                      <span className="block truncate">{e.action}</span>
                      <span className="block text-xs text-muted-foreground">{e.who} · {e.time}</span>
                    </span>
                  </li>
                ))}
            </ul>
          </div>
        ))
      )}
    </div>
  );
}
