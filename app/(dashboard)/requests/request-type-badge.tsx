import { ArrowsLeftRight, BookOpen, CalendarPlus, CalendarX, ClockClockwise, DoorOpen, UserGear, UserSwitch } from "@phosphor-icons/react/ssr";
import { Badge } from "@/components/ui/badge";
import { TYPE_LABELS } from "@/lib/requests/rules";

const ICONS: Record<string, typeof DoorOpen> = {
  NEW_SCHEDULE: CalendarPlus,
  CHANGE_ROOM: DoorOpen,
  CHANGE_TIME: ClockClockwise,
  CHANGE_FACULTY: UserSwitch,
  CANCEL_SCHEDULE: CalendarX,
  CROSS_DEPARTMENT: ArrowsLeftRight,
  FACULTY_CHANGE: UserGear,
  SUBJECT_CHANGE: BookOpen,
};

export function RequestTypeBadge({ type }: { type: string }) {
  const Icon = ICONS[type] ?? CalendarPlus;
  return (
    <Badge variant="outline" className="gap-1 whitespace-nowrap">
      <Icon className="size-3.5" aria-hidden /> {TYPE_LABELS[type] ?? type}
    </Badge>
  );
}
