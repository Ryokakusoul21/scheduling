"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { WeeklyCalendar, type CalendarEntry } from "@/components/scheduler/weekly-calendar";

type Mode = "section" | "faculty" | "room";

interface Entry extends CalendarEntry {
  sectionId: string;
  facultyId: string;
  roomId: string;
}

export function CalendarExplorer({
  entries,
  sections,
  faculty,
  rooms,
}: {
  entries: Entry[];
  sections: { id: string; label: string }[];
  faculty: { id: string; label: string }[];
  rooms: { id: string; label: string }[];
}) {
  const [mode, setMode] = useState<Mode>("section");
  const options = mode === "section" ? sections : mode === "faculty" ? faculty : rooms;
  const [selectedId, setSelectedId] = useState(options[0]?.id ?? "");

  const currentOptions = mode === "section" ? sections : mode === "faculty" ? faculty : rooms;
  const activeId = currentOptions.some((o) => o.id === selectedId) ? selectedId : currentOptions[0]?.id ?? "";

  const filtered = useMemo(() => {
    const key = mode === "section" ? "sectionId" : mode === "faculty" ? "facultyId" : "roomId";
    return entries.filter((e) => e[key] === activeId);
  }, [entries, mode, activeId]);

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
        <CardTitle>Weekly Timetable</CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <Tabs
            value={mode}
            onValueChange={(v) => {
              const next = (v ?? "section") as Mode;
              setMode(next);
              setSelectedId((next === "section" ? sections : next === "faculty" ? faculty : rooms)[0]?.id ?? "");
            }}
          >
            <TabsList>
              <TabsTrigger value="section">By Section</TabsTrigger>
              <TabsTrigger value="faculty">By Faculty</TabsTrigger>
              <TabsTrigger value="room">By Room</TabsTrigger>
            </TabsList>
          </Tabs>
          <Select value={activeId} onValueChange={(v) => setSelectedId(v ?? "")}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Select" />
            </SelectTrigger>
            <SelectContent>
              {currentOptions.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {filtered.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">No schedule entries found for this selection.</p>
        ) : (
          <WeeklyCalendar entries={filtered} />
        )}
      </CardContent>
    </Card>
  );
}
