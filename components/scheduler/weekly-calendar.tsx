export interface CalendarEntry {
  id: string;
  dayOfWeek: string;
  startMin: number;
  endMin: number;
  subjectName: string;
  subjectCode: string;
  facultyName: string;
  roomName: string;
  colorIndex: number;
}

const DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
const DAY_LABELS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_START = 7 * 60;
const DAY_END = 19 * 60;
const HOUR_HEIGHT = 52;

const PALETTE = [
  "bg-blue-100 text-blue-900 border-blue-300 dark:bg-blue-500/15 dark:text-blue-200 dark:border-blue-500/30",
  "bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-200 dark:border-emerald-500/30",
  "bg-violet-100 text-violet-900 border-violet-300 dark:bg-violet-500/15 dark:text-violet-200 dark:border-violet-500/30",
  "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-500/15 dark:text-amber-200 dark:border-amber-500/30",
  "bg-rose-100 text-rose-900 border-rose-300 dark:bg-rose-500/15 dark:text-rose-200 dark:border-rose-500/30",
  "bg-cyan-100 text-cyan-900 border-cyan-300 dark:bg-cyan-500/15 dark:text-cyan-200 dark:border-cyan-500/30",
];

function formatHour(min: number) {
  const h = Math.floor(min / 60);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:00 ${period}`;
}

export function WeeklyCalendar({ entries }: { entries: CalendarEntry[] }) {
  const hours: number[] = [];
  for (let m = DAY_START; m < DAY_END; m += 60) hours.push(m);
  const totalHeight = hours.length * HOUR_HEIGHT;

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[720px]">
        <div className="grid grid-cols-[64px_repeat(6,1fr)] border-b">
          <div />
          {DAY_LABELS.map((d) => (
            <div key={d} className="px-2 py-2 text-center text-xs font-semibold text-muted-foreground">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-[64px_repeat(6,1fr)]">
          <div style={{ height: totalHeight }} className="relative">
            {hours.map((h) => (
              <div
                key={h}
                style={{ top: ((h - DAY_START) / 60) * HOUR_HEIGHT }}
                className="absolute -translate-y-1/2 pr-2 text-right text-[10px] text-muted-foreground"
              >
                {formatHour(h)}
              </div>
            ))}
          </div>
          {DAYS.map((day) => (
            <div key={day} style={{ height: totalHeight }} className="relative border-l">
              {hours.map((h) => (
                <div
                  key={h}
                  style={{ top: ((h - DAY_START) / 60) * HOUR_HEIGHT }}
                  className="absolute w-full border-t border-dashed border-border/60"
                />
              ))}
              {entries
                .filter((e) => e.dayOfWeek === day)
                .map((e) => {
                  const top = ((e.startMin - DAY_START) / 60) * HOUR_HEIGHT;
                  const height = ((e.endMin - e.startMin) / 60) * HOUR_HEIGHT;
                  return (
                    <div
                      key={e.id}
                      style={{ top, height: Math.max(height, 30) }}
                      className={`absolute inset-x-0.5 overflow-hidden rounded-md border px-1.5 py-1 text-[10px] leading-tight ${PALETTE[e.colorIndex % PALETTE.length]}`}
                    >
                      <p className="truncate font-semibold">{e.subjectCode}</p>
                      <p className="truncate">{e.facultyName.replace("Prof. ", "")}</p>
                      <p className="truncate opacity-80">{e.roomName}</p>
                    </div>
                  );
                })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
