"use client";

import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ux/native-select";
import { formatTime } from "@/lib/scheduler/timetable";
import type { DayOfWeek } from "@/lib/scheduler/types";
import { timetableHours, timetableStep, timeInputMinutes, timeInputValue, type TimetableConfig } from "@/lib/timetable/config";

export function ConfiguredTimeInput({ id, config, day, value, onChange, preserveExisting = false }: {
  id: string; config: TimetableConfig; day: DayOfWeek; value: number; onChange: (value: number) => void; preserveExisting?: boolean;
}) {
  const hours = timetableHours(config, day);
  if (config.mode === "DYNAMIC") return <Input id={id} type="time" required step={preserveExisting ? 60 : timetableStep(config) * 60}
    min={preserveExisting ? undefined : timeInputValue(hours.startMin)} max={preserveExisting ? undefined : timeInputValue(Math.min(hours.endMin, 1439))}
    value={timeInputValue(value)} onChange={(e) => { if (e.target.value) onChange(timeInputMinutes(e.target.value)); }} />;
  const options = [];
  for (let min = hours.startMin; min <= hours.endMin; min += timetableStep(config)) options.push(min);
  // Preserve the exact value of existing classes even after configuration changes.
  if (!options.includes(value)) options.push(value);
  return <NativeSelect id={id} value={String(value)} onChange={(e) => onChange(Number(e.target.value))}
    options={options.sort((a, b) => a - b).map((min) => ({ value: String(min), label: formatTime(min, config.hour12) }))} />;
}
