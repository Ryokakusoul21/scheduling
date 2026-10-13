import { ArrowRight } from "@phosphor-icons/react/ssr";
import { Badge } from "@/components/ui/badge";
import { formatRange } from "@/lib/scheduler/timetable";
import type { PlanItem, Placement } from "@/lib/occupancy/adjust";
import { cn } from "@/lib/utils";

function Slot({ p, compare }: { p: Placement; compare?: Placement }) {
  const changed = (k: keyof Placement) => compare && compare[k] !== p[k];
  return (
    <div className="space-y-0.5 text-xs">
      <p className={cn(changed("date") && "font-semibold text-primary")}>{p.date}</p>
      <p className={cn((changed("startMin") || changed("endMin")) && "font-semibold text-primary")}>{formatRange(p.startMin, p.endMin)}</p>
      <p className={cn(changed("roomId") && "font-semibold text-primary")}>{p.roomName}</p>
      <p className={cn("text-muted-foreground", changed("facultyId") && "font-semibold text-primary")}>{p.facultyName}</p>
    </div>
  );
}

/** Before-and-after comparison of every affected class meeting with the reason for each change. */
export function ChangeList<T extends PlanItem>({
  items,
  empty = "No classes are affected.",
  extra,
}: {
  items: T[];
  empty?: string;
  /** Extra controls under an item (for example make-up class options). */
  extra?: (item: T) => React.ReactNode;
}) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="divide-y rounded-lg border">
      {items.map((i, n) => (
        <li key={`${i.scheduleId}-${i.before.date}-${n}`} className="grid gap-3 p-3 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{i.label}</p>
            <Badge variant={i.kind === "MOVED" ? "secondary" : "destructive"} className="mt-1">
              {i.kind === "MOVED" ? "Moved" : "Cancelled"}
            </Badge>
          </div>
          <Slot p={i.before} />
          <ArrowRight className="hidden size-4 text-muted-foreground sm:block" aria-hidden />
          {i.after ? <Slot p={i.after} compare={i.before} /> : <p className="text-xs text-muted-foreground">Needs a make-up class</p>}
          <p className="text-xs text-muted-foreground sm:col-span-4">{i.reason}</p>
          {extra && <div className="sm:col-span-4">{extra(i)}</div>}
        </li>
      ))}
    </ul>
  );
}
