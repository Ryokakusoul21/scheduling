import { ArrowsClockwise } from "@phosphor-icons/react/ssr";
import { formatRange } from "@/lib/scheduler/timetable";
import { formatDateRange } from "@/lib/student/format";
import type { PortalMove } from "@/lib/student/portal";

/** Small tag for a class that has a move in the next two weeks. */
export function MovedTag() {
  return (
    <span className="inline-flex w-fit items-center gap-1 rounded border border-amber-600/40 bg-amber-50 px-1.5 py-px text-xs font-medium whitespace-nowrap text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
      <ArrowsClockwise className="size-3" aria-hidden /> Moved
    </span>
  );
}

/** Where and when one moved meeting happens now, in plain words. */
function line(m: PortalMove) {
  const when = formatDateRange(m.newDate ?? m.date, m.newDate ?? m.date);
  if (m.kind === "ONLINE") return `${formatDateRange(m.date, m.date)} meets online or asynchronously, ${formatRange(m.startMin, m.endMin)}.`;
  const was = `${formatDateRange(m.date, m.date)}, ${formatRange(m.fromStartMin, m.fromEndMin)}${m.fromRoom ? ` in ${m.fromRoom}` : ""}`;
  return `Now ${when}, ${formatRange(m.startMin, m.endMin)}${m.room ? ` in ${m.room}` : ""}. Was ${was}.`;
}

/** Classes of the student's section that were moved or taken online soon, with a general reason. */
export function MovedList({ moves }: { moves: PortalMove[] }) {
  if (moves.length === 0) return null;
  return (
    <section aria-label="Changes to your classes" className="space-y-2 print:hidden">
      {moves.map((m) => (
        <div key={m.id} role="status" className="flex items-start gap-3 rounded-xl border border-amber-600/30 bg-amber-50 p-3 text-amber-950 dark:bg-amber-950/40 dark:text-amber-100">
          <ArrowsClockwise className="mt-0.5 size-5 shrink-0" aria-hidden />
          <div className="min-w-0 space-y-0.5">
            <p className="text-sm font-semibold">{m.subjectCode} was moved <span className="font-normal">· {m.subjectName}</span></p>
            <p className="text-sm">{line(m)}</p>
            <p className="text-xs">{m.reason}</p>
          </div>
        </div>
      ))}
    </section>
  );
}
