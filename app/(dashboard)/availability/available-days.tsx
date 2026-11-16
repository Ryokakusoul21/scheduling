"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarCheck, CircleNotch } from "@phosphor-icons/react/ssr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { WEEK_DAYS } from "@/lib/faculty/available-days";
import { DAY_LONG } from "@/lib/scheduler/timetable";
import { cn } from "@/lib/utils";
import { saveAvailableDaysAction } from "./actions";

/** Part-time faculty pick the days they can teach; the scheduler places their classes only on those days. */
export function AvailableDays({ days }: { days: string[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [chosen, setChosen] = useState(() => new Set(days));
  const changed = chosen.size !== days.length || days.some((d) => !chosen.has(d));

  function toggle(day: string) {
    const next = new Set(chosen);
    if (next.has(day)) next.delete(day);
    else next.add(day);
    setChosen(next);
  }

  function save() {
    startTransition(async () => {
      const res = await saveAvailableDaysAction([...chosen]);
      if (!res.ok) return void toast.error(res.error);
      toast.success(res.affected ? `Saved. ${res.affected} class${res.affected === 1 ? " is" : "es are"} on a day you removed; your Head of Department was notified.` : "Available days saved.");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-base"><CalendarCheck className="size-5 text-primary" aria-hidden /> My available days <Badge variant="secondary">{chosen.size}</Badge></CardTitle>
        <Button size="sm" onClick={save} disabled={pending || !changed || chosen.size === 0}>{pending && <CircleNotch className="size-4 animate-spin" />} Save</Button>
      </CardHeader>
      <CardContent className="space-y-2">
        <div role="group" aria-label="Days you can teach" className="flex flex-wrap gap-2">
          {WEEK_DAYS.map((day) => (
            <label key={day} className={cn("cursor-pointer rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors has-focus-visible:ring-2 has-focus-visible:ring-ring", chosen.has(day) ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>
              <input type="checkbox" className="sr-only" checked={chosen.has(day)} disabled={pending} onChange={() => toggle(day)} />
              {DAY_LONG[day]}
            </label>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">{chosen.size === 0 ? "Choose at least one day." : "Classes are scheduled only on these days."}</p>
      </CardContent>
    </Card>
  );
}
