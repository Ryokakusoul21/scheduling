"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { CalendarDays, Printer } from "lucide-react";
import { WeeklyCalendar, type CalendarEntry } from "./weekly-calendar";

export function DashboardCalendarCard({
  sections,
  entriesBySection,
}: {
  sections: { id: string; name: string }[];
  entriesBySection: Record<string, CalendarEntry[]>;
}) {
  const [sectionId, setSectionId] = useState(sections[0]?.id ?? "");
  const entries = useMemo(() => entriesBySection[sectionId] ?? [], [entriesBySection, sectionId]);

  return (
    <Card className="print:shadow-none">
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2">
          <CalendarDays className="size-5 text-primary" /> Weekly Class Schedule
        </CardTitle>
        <div className="flex items-center gap-2 print:hidden">
          {sections.length > 0 && (
            <Select value={sectionId} onValueChange={(v) => setSectionId(v ?? "")}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Select section" />
              </SelectTrigger>
              <SelectContent>
                {sections.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button variant="outline" size="sm" onClick={() => window.print()} disabled={entries.length === 0}>
            <Printer className="size-4" /> Print
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No published or draft schedule yet for this section. Generate one from the AI Auto
            Scheduler.
          </p>
        ) : (
          <WeeklyCalendar entries={entries} />
        )}
      </CardContent>
    </Card>
  );
}
