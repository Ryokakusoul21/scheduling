import { DAY_LONG, formatRange, formatTime, layoutLanes } from "@/lib/scheduler/timetable";
import type { DayOfWeek } from "@/lib/scheduler/types";

const DAYS: DayOfWeek[] = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
const START = 7 * 60;
const END = 19 * 60;
const HOUR_PX = 40;

export interface GridEntry {
  id: string;
  dayOfWeek: DayOfWeek;
  startMin: number;
  endMin: number;
  title: string;
  detail: string;
}

/** Read-only weekly timetable (Monday to Saturday, 7:00 AM to 7:00 PM). */
export function WeekGrid({ entries }: { entries: GridEntry[] }) {
  const height = ((END - START) / 60) * HOUR_PX;
  const y = (m: number) => ((Math.min(Math.max(m, START), END) - START) / 60) * HOUR_PX;
  const hours = Array.from({ length: (END - START) / 60 }, (_, i) => START + i * 60);
  return (
    <div className="overflow-x-auto rounded-lg border">
      <div className="grid min-w-[720px]" style={{ gridTemplateColumns: `52px repeat(${DAYS.length}, minmax(0, 1fr))` }}>
        <div className="border-b bg-muted/50" />
        {DAYS.map((d) => <div key={d} className="border-b border-l bg-muted/50 px-2 py-1 text-center text-xs font-medium">{DAY_LONG[d]}</div>)}
        <div className="relative" style={{ height }}>
          {hours.map((h) => (
            <span key={h} className="absolute right-1 -translate-y-1/2 text-[10px] text-muted-foreground" style={{ top: y(h) }}>
              {formatTime(h)}
            </span>
          ))}
        </div>
        {DAYS.map((d) => {
          const day = entries.filter((e) => e.dayOfWeek === d);
          const lanes = layoutLanes(day);
          return (
            <div key={d} className="relative border-l" style={{ height }}>
              {hours.map((h) => <div key={h} className="absolute inset-x-0 border-t border-dashed border-border/60" style={{ top: y(h) }} />)}
              {day.map((e) => {
                const l = lanes.get(e.id) ?? { lane: 0, lanes: 1 };
                return (
                  <div
                    key={e.id}
                    className="absolute overflow-hidden rounded border border-blue-500/50 bg-blue-500/10 px-1 py-0.5 text-[11px] leading-tight text-blue-900 dark:text-blue-100"
                    style={{ top: y(e.startMin), height: Math.max(y(e.endMin) - y(e.startMin), 18), left: `${(l.lane / l.lanes) * 100}%`, width: `${100 / l.lanes}%` }}
                    title={`${e.title}\n${formatRange(e.startMin, e.endMin)}\n${e.detail}`}
                  >
                    <span className="block truncate font-medium">{e.title}</span>
                    <span className="block truncate opacity-80">{e.detail}</span>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
